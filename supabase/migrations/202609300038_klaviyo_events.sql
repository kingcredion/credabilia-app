begin;

-- Klaviyo event tracking -----------------------------------------------------------------------
-- Same fire-and-forget pattern as notify_push (202609300032_push_notifications.sql): swallow any
-- error so a marketing-analytics call can never break the real action it's attached to, and no-op
-- silently until the 'klaviyo_private_api_key' Vault secret is actually configured. Goes straight
-- to Klaviyo's Events API via pg_net -- unlike push (which needs VAPID crypto only Deno/Node can
-- do), this is a plain authenticated JSON POST, so no edge-function indirection is needed.
-- Contract verified directly against Klaviyo's docs (developers.klaviyo.com/en/reference/create_event):
-- POST https://a.klaviyo.com/api/events, Authorization: Klaviyo-API-Key <key>, application/vnd.api+json.
create function public.notify_klaviyo(p_email text, p_event text, p_properties jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare secret text;
begin
  if p_email is null or btrim(p_email)='' then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='klaviyo_private_api_key';
  if secret is null then return; end if;
  perform net.http_post(
    url:='https://a.klaviyo.com/api/events',
    body:=jsonb_build_object('data',jsonb_build_object('type','event','attributes',jsonb_build_object(
      'properties',p_properties,
      'metric',jsonb_build_object('data',jsonb_build_object('type','metric','attributes',jsonb_build_object('name',p_event))),
      'profile',jsonb_build_object('data',jsonb_build_object('type','profile','attributes',jsonb_build_object('email',p_email)))
    ))),
    headers:=jsonb_build_object('Content-Type','application/vnd.api+json','Authorization','Klaviyo-API-Key '||secret,'Revision','2026-07-15'),
    timeout_milliseconds:=5000
  );
exception when others then null;
end;$$;
revoke all on function public.notify_klaviyo(text,text,jsonb) from public,anon,authenticated;

-- 1. Signed Up -- same 0-arg trigger signature as the live function (202609100001_foundation.sql).
create or replace function public.bootstrap_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Collector'), 100));
  insert into public.account_permissions(user_id) values (new.id);
  insert into public.user_progress(user_id) values (new.id);
  perform public.notify_klaviyo(new.email, 'Signed Up', '{}'::jsonb);
  return new;
end;
$$;

-- 2. Item Listed -- same 18-param signature as the live function (202609300035_auctions.sql).
create or replace function public.create_listing_with_details(
  p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',
  p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',
  p_attributes jsonb default '{}',p_tags jsonb default '[]',
  p_weight_oz numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,
  p_free_shipping boolean default false,
  p_listing_type text default 'fixed',p_auction_days integer default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; field record; tag jsonb; clean_attributes jsonb:='{}'; clean_tags jsonb:='[]'; clean text;
  allowed text[]:=array['item_type','subject','year','condition','grading_company','grade'];
begin
  if p_listing_type not in ('fixed','auction') then raise exception 'Invalid listing type.'; end if;
  if p_listing_type='auction' and p_auction_days not in (3,5,7) then raise exception 'Choose a 3, 5, or 7 day auction.'; end if;
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
    weight_oz=p_weight_oz,length_in=p_length_in,width_in=p_width_in,height_in=p_height_in,free_shipping=coalesce(p_free_shipping,false),
    listing_type=p_listing_type,auction_ends_at=case when p_listing_type='auction' then now()+make_interval(days=>p_auction_days) else null end
    where id=new_id;
  perform public.notify_klaviyo((select email from auth.users where id=auth.uid()),'Item Listed',
    jsonb_build_object('listing_id',new_id,'title',p_title,'category',p_category,'price_cents',p_price_cents,'listing_type',p_listing_type));
  return new_id;
end;
$$;

-- 3. Purchase Completed (buyer) + Item Sold (seller) -- same 2-param signature as the live
-- function (202609250018_escrow_and_insurance.sql).
create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint; seller_ship_charge bigint; is_insured boolean; insured_value bigint; item_title text;
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

  select title into item_title from public.listings where id=target.listing_id;
  perform public.notify_klaviyo((select email from auth.users where id=target.buyer_id),'Purchase Completed',
    jsonb_build_object('purchase_id',new_id,'listing_id',target.listing_id,'title',item_title,'price_cents',target.price_cents));
  perform public.notify_klaviyo((select email from auth.users where id=target.seller_id),'Item Sold',
    jsonb_build_object('purchase_id',new_id,'listing_id',target.listing_id,'title',item_title,'price_cents',target.price_cents));

  return new_id;
end;$$;

-- 4. Auction Won -- same 0-arg signature as the live function (202609300035_auctions.sql).
create or replace function public.settle_ended_auctions() returns integer
language plpgsql security definer set search_path='' as $$
declare item record; winning_bidder uuid; settled integer:=0; new_request_id uuid;
begin
  for item in select * from public.listings where listing_type='auction' and status='active' and auction_ends_at<=now() for update skip locked loop
    select bidder_id into winning_bidder from public.bids where listing_id=item.id order by amount_cents desc, created_at asc limit 1;
    if winning_bidder is not null then
      insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at,responded_at)
        values(item.id,winning_bidder,item.seller_id,'confirmed',now()+interval '48 hours',now())
        returning id into new_request_id;
      update public.listings set status='pending' where id=item.id;
      perform public.notify_push(winning_bidder, 'You won "'||item.title||'"!', 'Complete your purchase before this expires.', '/?item='||item.id);
      perform public.notify_push(item.seller_id, '"'||item.title||'" auction ended', 'The auction sold — the winning bidder can now check out.', '/?item='||item.id);
      perform public.notify_klaviyo((select email from auth.users where id=winning_bidder),'Auction Won',
        jsonb_build_object('listing_id',item.id,'title',item.title,'winning_bid_cents',item.price_cents));
    else
      update public.listings set status='archived' where id=item.id;
    end if;
    settled:=settled+1;
  end loop;
  return settled;
end;$$;

-- 5. Credion Coins Earned -- same 0-arg signature as the live function
-- (202609240016_fees_shipping_rewards.sql). credit_events stays a set-based insert (unchanged);
-- only a follow-up per-winner loop is added, purely to fire one event per person.
create or replace function public.run_monthly_auditor_rewards() returns void
language plpgsql security definer set search_path='' as $$
declare period timestamptz; pool bigint; winners integer; share bigint; rec record;
begin
  period:=date_trunc('month', now()) - interval '1 month';
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
    for rec in select u.email from _auditor_ranks r join auth.users u on u.id=r.user_id where r.decile=1 loop
      perform public.notify_klaviyo(rec.email, 'Credion Coins Earned', jsonb_build_object('amount_cents',share,'period',to_char(period,'Mon YYYY')));
    end loop;
  end if;

  insert into public.reward_pool_runs(period_start,pool_cents,winner_count) values(period,pool,winners);
end;$$;

commit;
