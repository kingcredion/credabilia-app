begin;

-- A. Escrow: payment sits on the platform's own Stripe balance and is only transferred to the
-- seller once release_purchase_escrow/mark_purchase_released runs (on delivery, or the daily
-- auto-release fallback) -- not instantly at checkout like the old destination-charge flow.

alter table public.purchases
  add column escrow_status text not null default 'held' check (escrow_status in ('held','released','refunded')),
  add column funds_released_at timestamptz,
  add column stripe_transfer_id text,
  add column insured boolean not null default false,
  add column insured_value_cents bigint not null default 0,
  add column insurance_cost_cents bigint not null default 0;

alter table public.checkout_sessions
  add column want_insurance boolean not null default true,
  add column insurance_cost_cents bigint not null default 0;

-- reserve_listing_checkout now also records whether the buyer wants insurance (on by default),
-- so create-checkout-session knows to request an insured Shippo quote.
drop function public.reserve_listing_checkout(uuid,jsonb,bigint);

create function public.reserve_listing_checkout(p_listing_id uuid, p_shipping_address jsonb, p_apply_credit_cents bigint default 0, p_want_insurance boolean default true) returns jsonb
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

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at,shipping_address,applied_credit_cents,free_shipping,want_insurance)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes',p_shipping_address,credit_to_apply,item.free_shipping,coalesce(p_want_insurance,true))
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
    'want_insurance',coalesce(p_want_insurance,true),
    'parcel',case when item.weight_oz is not null and item.length_in is not null and item.width_in is not null and item.height_in is not null
      then jsonb_build_object('weight_oz',item.weight_oz,'length_in',item.length_in,'width_in',item.width_in,'height_in',item.height_in)
      else null end
  );
end;$$;
revoke all on function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean) from public,anon;
grant execute on function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean) to authenticated;

-- attach_stripe_checkout_session now also records the real, marked-up insurance premium the edge
-- function computed after a live Shippo quote (separate from shipping_cost_cents, since insurance
-- is always buyer-paid regardless of free_shipping).
drop function public.attach_stripe_checkout_session(uuid,text,bigint);

create function public.attach_stripe_checkout_session(p_checkout_session_id uuid, p_stripe_session_id text, p_shipping_cost_cents bigint default 0, p_insurance_cost_cents bigint default 0) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  update public.checkout_sessions set stripe_checkout_session_id=p_stripe_session_id, shipping_cost_cents=coalesce(p_shipping_cost_cents,0), insurance_cost_cents=coalesce(p_insurance_cost_cents,0)
    where id=p_checkout_session_id and buyer_id=auth.uid() and status='pending';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Checkout session not found.'; end if;
end;$$;
revoke all on function public.attach_stripe_checkout_session(uuid,text,bigint,bigint) from public,anon;
grant execute on function public.attach_stripe_checkout_session(uuid,text,bigint,bigint) to authenticated;

-- finalize_checkout_session: unchanged fee/shipping math; now also copies the insurance choice
-- onto the purchase row. escrow_status stays at its column default ('held') -- release only ever
-- happens via mark_purchase_released below, never here.
create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint; seller_ship_charge bigint; is_insured boolean; insured_value bigint;
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
  is_insured:=target.want_insurance and coalesce(target.insurance_cost_cents,0)>0;
  insured_value:=case when is_insured then least(target.price_cents,1000000) else 0 end;
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents,shipping_address,shipping_cost_cents,seller_shipping_charge_cents,applied_credit_cents,insured,insured_value_cents,insurance_cost_cents)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee,target.shipping_address,coalesce(target.shipping_cost_cents,0),seller_ship_charge,coalesce(target.applied_credit_cents,0),is_insured,insured_value,coalesce(target.insurance_cost_cents,0))
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;

-- Releases escrowed funds to the seller. Called only from trusted server contexts (the tracking
-- webhook on delivery, or the daily stale-escrow sweep) after they've made the real Stripe
-- Transfer -- never self-reportable by a buyer or seller, same principle as update_tracking_status.
create function public.mark_purchase_released(p_purchase_id uuid, p_stripe_transfer_id text) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  update public.purchases set escrow_status='released', funds_released_at=now(), stripe_transfer_id=p_stripe_transfer_id
    where id=p_purchase_id and escrow_status='held';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Purchase not found or already released.'; end if;
end;$$;
revoke all on function public.mark_purchase_released(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_purchase_released(uuid,text) to service_role;

create or replace function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shipping_cost_cents',p.shipping_cost_cents,'seller_shipping_charge_cents',p.seller_shipping_charge_cents,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'funds_released_at',p.funds_released_at,
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
    'escrow_status',p.escrow_status,'insured',p.insured,'insurance_cost_cents',p.insurance_cost_cents,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.buyer_id=auth.uid();
$$;

commit;
