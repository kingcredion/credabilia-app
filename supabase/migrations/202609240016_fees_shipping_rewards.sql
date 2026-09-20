begin;

-- A. Platform fee formula -- matches eBay's real structure instead of a flat rate. -------------

create function public.platform_fee_cents(p_price_cents bigint) returns bigint
language sql immutable set search_path='' as $$
  select round(p_price_cents*0.136) + (case when p_price_cents<=1000 then 30 else 40 end);
$$;

-- B. Shipping: weight/dimensions + free-shipping choice at listing time, real cost at checkout --

alter table public.listings
  add column weight_oz numeric, add column length_in numeric, add column width_in numeric, add column height_in numeric,
  add column free_shipping boolean not null default false;

-- Same pattern already used for attributes/tags: extend only the live entry point of the
-- listing-creation chain and UPDATE the new fields in afterward, rather than threading new
-- parameters through create_listing/create_listing_with_certificate/create_listing_with_media too.
drop function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb);

create function public.create_listing_with_details(
  p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',
  p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',
  p_attributes jsonb default '{}',p_tags jsonb default '[]',
  p_weight_oz numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,
  p_free_shipping boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; field record; tag jsonb; clean_attributes jsonb:='{}'; clean_tags jsonb:='[]'; clean text;
  allowed text[]:=array['item_type','subject','year','condition','grading_company','grade'];
begin
  if p_category='Sports' then allowed:=allowed||array['sport','team'];
  elsif p_category='Art' then allowed:=allowed||array['artist','medium','dimensions'];
  elsif p_category='Comics' then allowed:=allowed||array['publisher','issue']; end if;
  if p_attributes is null or jsonb_typeof(p_attributes)<>'object' then raise exception 'Invalid item details'; end if;
  for field in select * from jsonb_each(p_attributes) loop
    if not(field.key=any(allowed)) or jsonb_typeof(field.value)<>'string' then raise exception 'Unsupported item detail'; end if;
    clean:=btrim(field.value#>>'{}');
    if length(clean)>120 then raise exception 'Item detail too long'; end if;
    if clean<>'' then clean_attributes:=clean_attributes||jsonb_build_object(field.key,clean); end if;
  end loop;
  if p_tags is null or jsonb_typeof(p_tags)<>'array' then raise exception 'Invalid tags'; end if;
  for tag in select * from jsonb_array_elements(p_tags) loop
    if jsonb_typeof(tag)<>'string' then raise exception 'Invalid tag'; end if;
    clean:=lower(regexp_replace(btrim(tag#>>'{}'),'\s+',' ','g'));
    if length(clean)>40 then raise exception 'Tag too long'; end if;
    if clean<>'' and not(clean_tags ? clean) then clean_tags:=clean_tags||jsonb_build_array(clean); end if;
  end loop;
  if jsonb_array_length(clean_tags)>8 then raise exception 'Too many tags'; end if;
  if p_weight_oz is null or p_weight_oz<=0 or p_length_in is null or p_length_in<=0
     or p_width_in is null or p_width_in<=0 or p_height_in is null or p_height_in<=0 then
    raise exception 'Enter a valid package weight and size.';
  end if;
  new_id:=public.create_listing_with_media(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company,p_media);
  update public.listings set attributes=clean_attributes,tags=clean_tags,
    weight_oz=p_weight_oz,length_in=p_length_in,width_in=p_width_in,height_in=p_height_in,free_shipping=coalesce(p_free_shipping,false)
    where id=new_id;
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean) from public,anon;
grant execute on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean) to authenticated;

alter table public.checkout_sessions
  add column shipping_cost_cents bigint not null default 0,
  add column applied_credit_cents bigint not null default 0,
  add column free_shipping boolean not null default false;

-- C. Platform credit ledger (needed by reserve_listing_checkout below) -------------------------

create table public.credit_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  amount_cents bigint not null, -- positive = earned/refunded, negative = spent
  reason text not null,
  created_at timestamptz not null default now()
);
create index credit_events_user on public.credit_events(user_id, created_at);
alter table public.credit_events enable row level security;
revoke all on public.credit_events from public,anon,authenticated;

create function public.my_credit_balance() returns bigint
language sql stable security definer set search_path='' as $$
  select coalesce(sum(amount_cents),0) from public.credit_events where user_id=auth.uid();
$$;
revoke all on function public.my_credit_balance() from public,anon;
grant execute on function public.my_credit_balance() to authenticated;

-- reserve_listing_checkout: requires a shipping address for this order (unchanged) and now also
-- accepts an optional credit amount to apply, capped at the platform's own fee on this item so
-- credit can never cost more than the platform would have earned, and never dips into what the
-- seller is owed. Also returns everything create-checkout-session needs to quote real shipping
-- (seller's saved address, listing's parcel dimensions, free-shipping choice) without a second
-- round trip.
drop function public.reserve_listing_checkout(uuid,jsonb);

create function public.reserve_listing_checkout(p_listing_id uuid, p_shipping_address jsonb, p_apply_credit_cents bigint default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; seller_profile public.profiles;
  new_id uuid; updated integer; balance bigint; credit_to_apply bigint:=0;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;
  if coalesce(btrim(p_shipping_address->>'name'),'')='' or coalesce(btrim(p_shipping_address->>'street1'),'')='' or coalesce(btrim(p_shipping_address->>'city'),'')=''
     or coalesce(btrim(p_shipping_address->>'state'),'')='' or coalesce(btrim(p_shipping_address->>'zip'),'')='' or coalesce(btrim(p_shipping_address->>'country'),'')='' then
    raise exception 'Fill in all required address fields.';
  end if;
  if coalesce(p_apply_credit_cents,0)<0 then raise exception 'Invalid credit amount.'; end if;

  -- Self-heal a listing stuck on 'pending' from an abandoned/expired checkout -- no cron needed.
  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();
  update public.listings set status='active' where id=p_listing_id and status='pending'
    and not exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending');

  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  select * into seller_account from public.stripe_accounts where user_id=item.seller_id;
  if not found or not seller_account.charges_enabled then raise exception 'This seller has not finished payment setup yet.'; end if;
  select * into seller_profile from public.profiles where id=item.seller_id;

  if coalesce(p_apply_credit_cents,0)>0 then
    select coalesce(sum(amount_cents),0) into balance from public.credit_events where user_id=actor;
    if p_apply_credit_cents>balance then raise exception 'You do not have that much credit available.'; end if;
    credit_to_apply:=least(p_apply_credit_cents, public.platform_fee_cents(item.price_cents));
  end if;

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at,shipping_address,applied_credit_cents,free_shipping)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes',p_shipping_address,credit_to_apply,item.free_shipping)
    returning id into new_id;

  if credit_to_apply>0 then
    insert into public.credit_events(user_id,amount_cents,reason) values(actor,-credit_to_apply,'Applied to checkout');
  end if;

  update public.listings set status='pending' where id=p_listing_id and status='active';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'This item was just reserved by someone else.'; end if;

  return jsonb_build_object(
    'checkout_session_id',new_id,'price_cents',item.price_cents,'stripe_account_id',seller_account.stripe_account_id,'title',item.title,
    'applied_credit_cents',credit_to_apply,'free_shipping',item.free_shipping,'seller_shipping_address',seller_profile.shipping_address,
    'parcel',case when item.weight_oz is not null and item.length_in is not null and item.width_in is not null and item.height_in is not null
      then jsonb_build_object('weight_oz',item.weight_oz,'length_in',item.length_in,'width_in',item.width_in,'height_in',item.height_in)
      else null end
  );
end;$$;
revoke all on function public.reserve_listing_checkout(uuid,jsonb,bigint) from public,anon;
grant execute on function public.reserve_listing_checkout(uuid,jsonb,bigint) to authenticated;

-- attach_stripe_checkout_session now also records the real, marked-up shipping cost the edge
-- function computed after a live Shippo quote, so finalize_checkout_session can read it back.
drop function public.attach_stripe_checkout_session(uuid,text);

create function public.attach_stripe_checkout_session(p_checkout_session_id uuid, p_stripe_session_id text, p_shipping_cost_cents bigint default 0) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  update public.checkout_sessions set stripe_checkout_session_id=p_stripe_session_id, shipping_cost_cents=coalesce(p_shipping_cost_cents,0)
    where id=p_checkout_session_id and buyer_id=auth.uid() and status='pending';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Checkout session not found.'; end if;
end;$$;
revoke all on function public.attach_stripe_checkout_session(uuid,text,bigint) from public,anon;
grant execute on function public.attach_stripe_checkout_session(uuid,text,bigint) to authenticated;

-- Cancelling/expiring a reservation now also refunds any credit that was optimistically spent.
create or replace function public.cancel_checkout_session(p_stripe_session_id text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id and buyer_id=auth.uid() for update;
  if not found or target.status<>'pending' then return; end if;
  update public.checkout_sessions set status='canceled' where id=target.id;
  update public.listings set status='active' where id=target.listing_id and status='pending';
  if target.applied_credit_cents>0 then
    insert into public.credit_events(user_id,amount_cents,reason) values(target.buyer_id,target.applied_credit_cents,'Refund: checkout canceled');
  end if;
end;$$;

create or replace function public.expire_checkout_session(p_stripe_session_id text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found or target.status<>'pending' then return; end if;
  update public.checkout_sessions set status='expired' where id=target.id;
  update public.listings set status='active' where id=target.listing_id and status='pending';
  if target.applied_credit_cents>0 then
    insert into public.credit_events(user_id,amount_cents,reason) values(target.buyer_id,target.applied_credit_cents,'Refund: checkout expired');
  end if;
end;$$;

-- Purchases gain shipping/credit bookkeeping ----------------------------------------------------
-- seller_shipping_charge_cents is separate from shipping_cost_cents specifically so the reward
-- pool (which sums platform_fee_cents only) never sees shipping revenue, matching the rule that
-- the pool only ever comes from the actual selling fee.

alter table public.purchases
  add column shipping_cost_cents bigint not null default 0,
  add column seller_shipping_charge_cents bigint not null default 0,
  add column applied_credit_cents bigint not null default 0;

-- seller_payout_cents is a generated column; its formula must change to also subtract
-- seller_shipping_charge_cents (only nonzero for free-shipping listings), so it has to be
-- dropped and re-added rather than altered in place.
alter table public.purchases drop column seller_payout_cents;
alter table public.purchases add column seller_payout_cents bigint generated always as (price_cents - platform_fee_cents - seller_shipping_charge_cents) stored;

create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint; seller_ship_charge bigint;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found then raise exception 'Checkout session not found.'; end if;

  if target.status='completed' then
    select id into new_id from public.purchases where listing_id=target.listing_id and buyer_id=target.buyer_id;
    return new_id;
  end if;
  if target.status<>'pending' then raise exception 'This checkout session is no longer active.'; end if;

  fee:=public.platform_fee_cents(target.price_cents);
  seller_ship_charge:=case when target.free_shipping then coalesce(target.shipping_cost_cents,0) else 0 end;
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents,shipping_address,shipping_cost_cents,seller_shipping_charge_cents,applied_credit_cents)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee,target.shipping_address,coalesce(target.shipping_cost_cents,0),seller_ship_charge,coalesce(target.applied_credit_cents,0))
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;

create or replace function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shipping_cost_cents',p.shipping_cost_cents,'seller_shipping_charge_cents',p.seller_shipping_charge_cents,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.seller_id=auth.uid();
$$;

create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,'shipping_cost_cents',p.shipping_cost_cents,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.buyer_id=auth.uid();
$$;

-- D. Monthly auditor reward pool ------------------------------------------------------------
-- 5% of last month's platform_fee_cents (selling fee only, never shipping) split evenly across
-- the top 10% of that month's active auditors. Every accepted submit_audit() call already writes
-- one reward_events row, so that's the source of truth for "who audited, and when" -- no new
-- qualifying-audit logic needed.

create table public.reward_pool_runs(
  period_start timestamptz primary key,
  pool_cents bigint not null,
  winner_count integer not null,
  run_at timestamptz not null default now()
);
alter table public.reward_pool_runs enable row level security;
revoke all on public.reward_pool_runs from public,anon,authenticated;

create function public.run_monthly_auditor_rewards() returns void
language plpgsql security definer set search_path='' as $$
declare period timestamptz; pool bigint; winners integer; share bigint;
begin
  period:=date_trunc('month', now()) - interval '1 month'; -- the calendar month that just ended
  if exists(select 1 from public.reward_pool_runs where period_start=period) then return; end if;

  select coalesce(sum(platform_fee_cents),0) into pool
    from public.purchases where created_at>=period and created_at<period + interval '1 month';
  pool:=round(pool*0.05);

  create temporary table _auditor_ranks on commit drop as
    select user_id, count(*) as audits, ntile(10) over (order by count(*) desc) as decile
    from public.reward_events where created_at>=period and created_at<period + interval '1 month'
    group by user_id;

  winners:=coalesce((select count(*) from _auditor_ranks where decile=1),0);

  if winners>0 and pool>0 then
    share:=pool/winners;
    insert into public.credit_events(user_id,amount_cents,reason)
      select user_id, share, 'Top 10% auditor reward — '||to_char(period,'Mon YYYY') from _auditor_ranks where decile=1;
  end if;

  insert into public.reward_pool_runs(period_start,pool_cents,winner_count) values(period,pool,winners);
end;$$;
revoke all on function public.run_monthly_auditor_rewards() from public,anon,authenticated;

commit;
