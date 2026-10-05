begin;

-- Pre-launch hardening: tiered payout holds, server-only shipment recording, and a handoff code for local pickup.
--
-- 1. Payouts no longer release the instant a carrier scans "delivered". Delivery (or a verified pickup handoff) starts a hold
--    whose length depends on the seller's history and the sale price. New sellers wait longer and cannot be released early by
--    the buyer (a stolen-card buyer could otherwise tap "release" to cash out a fraudulent seller before the real card owner
--    disputes). An open refund request freezes any payout. A flagged or banned seller's payouts wait for a human.
-- 2. record_shipment used to be callable by any signed-in seller with made-up tracking data; the old 10-day sweep then paid them
--    without any delivery. It is now service_role only and only the label-buying function calls it.
-- 3. Local pickup: the buyer sees a 6-digit code, reads it to the seller at the meetup, and the seller enters it. That is the proof.

alter table public.profiles
  add column payout_review boolean not null default false,
  add column banned_at timestamptz,
  add column ban_reason text;

alter table public.purchases
  add column delivered_at timestamptz,
  add column release_after timestamptz,
  add column hold_tier text,
  add column hold_hours integer,
  add column pickup_code text,
  add column pickup_code_attempts integer not null default 0,
  add column handoff_verified_at timestamptz;

create index purchases_release_due on public.purchases(release_after) where escrow_status='held';

-- Any refund request that is still alive blocks payout.
create function public.has_open_dispute(p_purchase_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.refund_requests where purchase_id=p_purchase_id and status in ('pending','contested','partial_offered','return_required','accepted'));
$$;
revoke all on function public.has_open_dispute(uuid) from public,anon,authenticated;

-- The seller's payout tier for one sale. flagged = banned or under review (no automatic payout).
-- New: fewer than 3 clean completed sales. Established: 3+. Trusted: 10+ with 3+ ratings averaging 4.5+.
-- "Clean" = escrow was released and no refund request was ever upheld or left open (a denied request still counts as clean).
create function public.seller_payout_tier(p_seller uuid, p_price_cents bigint, p_pickup boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prof public.profiles; clean_sales integer; rated integer; avg_rating numeric; tier text; hours integer; early boolean;
begin
  select * into prof from public.profiles where id=p_seller;
  if not found or prof.banned_at is not null or prof.payout_review then
    return jsonb_build_object('tier','flagged','hold_hours',null,'early_release',false);
  end if;
  select count(*) into clean_sales from public.purchases p
    where p.seller_id=p_seller and p.escrow_status='released'
      and not exists(select 1 from public.refund_requests r where r.purchase_id=p.id and r.status<>'denied');
  select count(*), avg(rating) into rated, avg_rating from public.seller_ratings where seller_id=p_seller;
  if clean_sales>=10 and rated>=3 and avg_rating>=4.5 then
    tier:='trusted'; hours:=case when p_price_cents>=50000 then 72 else 48 end; early:=true;
  elsif clean_sales>=3 then
    tier:='established'; hours:=72; early:=true;
  else
    tier:='new'; hours:=case when p_price_cents<10000 then 72 when p_price_cents<=50000 then 120 else 168 end; early:=false;
  end if;
  -- A proven in-person handoff needs no inspection wait for sellers with a clean history.
  if p_pickup and early then hours:=0; end if;
  return jsonb_build_object('tier',tier,'hold_hours',hours,'early_release',early);
end;$$;
revoke all on function public.seller_payout_tier(uuid,bigint,boolean) from public,anon,authenticated;

-- Starts the payout clock for a purchase (delivery or verified handoff). Idempotent: the first call wins.
create function public.schedule_payout(p_purchase_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; t jsonb;
begin
  select * into purchase from public.purchases where id=p_purchase_id for update;
  if not found or purchase.escrow_status<>'held' or purchase.delivered_at is not null then return; end if;
  t:=public.seller_payout_tier(purchase.seller_id,purchase.price_cents,purchase.fulfillment_method='pickup');
  update public.purchases set delivered_at=now(), hold_tier=t->>'tier', hold_hours=(t->>'hold_hours')::integer,
    release_after=case when t->>'tier'='flagged' then null else now()+make_interval(hours=>(t->>'hold_hours')::integer) end
    where id=p_purchase_id;
end;$$;
revoke all on function public.schedule_payout(uuid) from public,anon,authenticated;

-- Shippo tracking updates (service_role only). The first DELIVERED starts the payout hold instead of paying out.
create or replace function public.update_tracking_status(p_tracking_number text, p_tracking_status text) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text;
begin
  for purchase in select * from public.purchases where tracking_number=p_tracking_number loop
    update public.purchases set tracking_status=p_tracking_status where id=purchase.id;
    if p_tracking_status='DELIVERED' and purchase.tracking_status is distinct from 'DELIVERED' then
      select title into item_title from public.listings where id=purchase.listing_id;
      perform public.notify_klaviyo_user(purchase.buyer_id,'Item Delivered',jsonb_build_object(
        'listing_id',purchase.listing_id,'title',item_title,'tracking_url',purchase.tracking_url));
      perform public.schedule_payout(purchase.id);
    end if;
  end loop;
end;$$;

-- record_shipment: server only. The label-buying edge function passes the seller's id; the sale must be that seller's, a shipped
-- (not pickup) order that is still held and not already shipped, so a shipment can never be faked, replaced or re-recorded.
drop function public.record_shipment(uuid,text,text,text,text);
create function public.record_shipment(p_purchase_id uuid, p_seller_id uuid, p_shippo_transaction_id text, p_tracking_number text, p_tracking_url text, p_label_url text) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text;
begin
  select * into purchase from public.purchases where id=p_purchase_id and seller_id=p_seller_id and fulfillment_method='ship' and escrow_status='held' for update;
  if not found then raise exception 'Sale not found.'; end if;
  if purchase.shipped_at is not null then return; end if;
  update public.purchases set shippo_transaction_id=p_shippo_transaction_id, tracking_number=p_tracking_number, tracking_url=p_tracking_url, label_url=p_label_url, shipped_at=now()
    where id=p_purchase_id;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_klaviyo_user(purchase.buyer_id,'Item Shipped',jsonb_build_object(
    'listing_id',purchase.listing_id,'title',item_title,'tracking_number',p_tracking_number,'tracking_url',p_tracking_url));
end;$$;
revoke all on function public.record_shipment(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_shipment(uuid,uuid,text,text,text,text) to service_role;

-- Pickup: replaces mark_picked_up / confirm_pickup_received (seller and buyer each tapping a button) with a code.
drop function public.mark_picked_up(uuid);
drop function public.confirm_pickup_received(uuid);


create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint; seller_ship_charge bigint; is_insured boolean; insured_value bigint; conv_id uuid; code text;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found then raise exception 'Checkout session not found.'; end if;

  if target.status='completed' then
    select id into new_id from public.purchases where listing_id=target.listing_id and buyer_id=target.buyer_id;
    return new_id;
  end if;
  if target.status<>'pending' then raise exception 'This checkout session is no longer active.'; end if;

  select id into conv_id from public.conversations where listing_id=target.listing_id and buyer_id=target.buyer_id;
  if conv_id is null then
    insert into public.conversations(listing_id,buyer_id,seller_id) values(target.listing_id,target.buyer_id,target.seller_id) returning id into conv_id;
  end if;

  code:=case when target.fulfillment_method='pickup' then lpad((floor(random()*1000000))::int::text,6,'0') else null end;
  fee:=public.platform_fee_cents(target.price_cents);
  seller_ship_charge:=case when target.free_shipping then coalesce(target.shipping_cost_cents,0) else 0 end;
  is_insured:=target.want_insurance and coalesce(target.insurance_cost_cents,0)>0;
  insured_value:=case when is_insured then least(target.price_cents,1000000) else 0 end;
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents,shipping_address,shipping_cost_cents,seller_shipping_charge_cents,applied_credit_cents,insured,insured_value_cents,insurance_cost_cents,fulfillment_method,pickup_station_id,conversation_id,pickup_code)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee,target.shipping_address,coalesce(target.shipping_cost_cents,0),seller_ship_charge,coalesce(target.applied_credit_cents,0),is_insured,insured_value,coalesce(target.insurance_cost_cents,0),target.fulfillment_method,target.pickup_station_id,conv_id,code)
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;

create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',x.kind,'role',x.role,'purchase_id',x.purchase_id,'listing_id',x.listing_id,'title',x.title,'message',x.message,'conversation_id',x.conversation_id
  ) order by x.at desc),'[]'::jsonb) from (
    select 'refund_pending' as kind, 'seller' as role, p.id as purchase_id, l.id as listing_id, l.title,
      'Refund requested for "'||l.title||'"' as message, r.created_at as at, null::uuid as conversation_id
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.seller_id=auth.uid() and r.status='pending'

    union all

    select 'partial_offered', 'buyer', p.id, l.id, l.title,
      'Partial refund offered for "'||l.title||'"', r.created_at, null::uuid
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='partial_offered'

    union all

    select 'return_required', 'buyer', p.id, l.id, l.title,
      'Ship "'||l.title||'" back to get your refund', r.created_at, null::uuid
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='return_required' and r.return_shipped_at is null

    union all

    select 'message', 'seller', null::uuid, l.id, l.title,
      'New message about "'||l.title||'"', last_from_buyer.at, c.id
    from public.conversations c join public.listings l on l.id=c.listing_id
    join lateral (select max(created_at) as at from public.messages where conversation_id=c.id and sender_id=c.buyer_id) last_from_buyer on true
    where c.seller_id=auth.uid() and last_from_buyer.at is not null and last_from_buyer.at>coalesce(c.seller_last_read_at,'-infinity'::timestamptz)

    union all

    select 'message', 'buyer', null::uuid, l.id, l.title,
      'New message about "'||l.title||'"', last_from_seller.at, c.id
    from public.conversations c join public.listings l on l.id=c.listing_id
    join lateral (select max(created_at) as at from public.messages where conversation_id=c.id and sender_id=c.seller_id) last_from_seller on true
    where c.buyer_id=auth.uid() and last_from_seller.at is not null and last_from_seller.at>coalesce(c.buyer_last_read_at,'-infinity'::timestamptz)

    union all

    select 'buy_request_pending', 'seller', null::uuid, l.id, l.title,
      'Confirm "'||l.title||'" is still available', r.created_at, null::uuid
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.seller_id=auth.uid() and r.status='pending' and r.expires_at>now()

    union all

    select 'buy_request_confirmed', 'buyer', null::uuid, l.id, l.title,
      '"'||l.title||'" is confirmed available — complete your purchase', r.responded_at, null::uuid
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.buyer_id=auth.uid() and r.status='confirmed' and r.expires_at>now()

    union all

    select 'pickup_awaiting_handoff', 'seller', p.id, l.id, l.title,
      'Enter the buyer''s handoff code for "'||l.title||'" once you''ve handed it over', p.created_at, null::uuid
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null

  ) x;
$$;

-- Seller enters the buyer's 6-digit code at the meetup. A wrong code returns ok=false (an exception would roll back the attempt
-- counter), and five wrong codes lock the order for support.
create function public.complete_pickup(p_purchase_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean text; fresh public.purchases;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and seller_id=actor and fulfillment_method='pickup' for update;
  if not found then raise exception 'Sale not found.'; end if;
  if purchase.escrow_status<>'held' or purchase.handoff_verified_at is not null then raise exception 'This handoff is already complete.'; end if;
  if public.has_open_dispute(p_purchase_id) then raise exception 'This order has an open refund request.'; end if;
  if purchase.pickup_code_attempts>=5 then raise exception 'Too many wrong codes. Contact support.'; end if;
  clean:=regexp_replace(coalesce(p_code,''),'\s','','g');
  if purchase.pickup_code is null or clean<>purchase.pickup_code then
    update public.purchases set pickup_code_attempts=pickup_code_attempts+1 where id=p_purchase_id;
    return jsonb_build_object('ok',false,'attempts_left',greatest(0,4-purchase.pickup_code_attempts));
  end if;
  update public.purchases set handoff_verified_at=now(), seller_marked_picked_up_at=now(), buyer_confirmed_pickup_at=now() where id=p_purchase_id;
  perform public.schedule_payout(p_purchase_id);
  select * into fresh from public.purchases where id=p_purchase_id;
  return jsonb_build_object('ok',true,'release_after',fresh.release_after,'hold_tier',fresh.hold_tier);
end;$$;
revoke all on function public.complete_pickup(uuid,text) from public,anon;
grant execute on function public.complete_pickup(uuid,text) to authenticated;

-- Buyer says everything is fine: pays out at the next hourly sweep, but only for sellers whose tier allows early release.
create function public.release_early(p_purchase_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; t jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and buyer_id=actor for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if purchase.escrow_status<>'held' or purchase.delivered_at is null then raise exception 'This order is not waiting on a payout.'; end if;
  if public.has_open_dispute(p_purchase_id) then raise exception 'This order has an open refund request.'; end if;
  t:=public.seller_payout_tier(purchase.seller_id,purchase.price_cents,purchase.fulfillment_method='pickup');
  if not coalesce((t->>'early_release')::boolean,false) then raise exception 'The seller is paid automatically after the inspection period. You can still report a problem until then.'; end if;
  update public.purchases set release_after=least(coalesce(release_after,now()),now()) where id=p_purchase_id;
  return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.release_early(uuid) from public,anon;
grant execute on function public.release_early(uuid) to authenticated;

-- What the hourly sweep may pay out: hold elapsed, no open refund request, seller not flagged or banned. A parcel that carriers
-- never mark delivered is paid out only after 21 days of "in transit", and only if nobody disputed it.
create function public.due_releases() returns setof public.purchases
language sql stable security definer set search_path='' as $$
  select p.* from public.purchases p join public.profiles s on s.id=p.seller_id
  where p.escrow_status='held' and not s.payout_review and s.banned_at is null
    and not public.has_open_dispute(p.id)
    and ((p.release_after is not null and p.release_after<=now())
      or (p.delivered_at is null and p.fulfillment_method='ship' and p.shipped_at is not null and p.shipped_at<now()-interval '21 days' and p.tracking_status='TRANSIT'));
$$;
revoke all on function public.due_releases() from public,anon,authenticated;
grant execute on function public.due_releases() to service_role;

-- What each side sees on an order: when the money is due, whether it can be released early, the buyer's pickup code.
create function public.my_payout_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'purchase_id',p.id,'role',case when p.buyer_id=auth.uid() then 'buyer' else 'seller' end,
    'fulfillment_method',p.fulfillment_method,'escrow_status',p.escrow_status,
    'delivered_at',p.delivered_at,'release_after',p.release_after,'hold_tier',p.hold_tier,
    'under_review',p.seller_id=auth.uid() and p.escrow_status='held' and p.delivered_at is not null and p.release_after is null,
    'has_open_dispute',public.has_open_dispute(p.id),
    'can_release_early',p.buyer_id=auth.uid() and p.escrow_status='held' and p.delivered_at is not null and p.release_after>now()
      and not public.has_open_dispute(p.id)
      and coalesce((public.seller_payout_tier(p.seller_id,p.price_cents,p.fulfillment_method='pickup')->>'early_release')::boolean,false),
    'handoff_verified_at',p.handoff_verified_at,
    'pickup_code',case when p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null then p.pickup_code else null end,
    'pickup_attempts_left',case when p.seller_id=auth.uid() and p.fulfillment_method='pickup' then greatest(0,5-p.pickup_code_attempts) else null end
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p where p.buyer_id=auth.uid() or p.seller_id=auth.uid();
$$;
revoke all on function public.my_payout_status() from public,anon;
grant execute on function public.my_payout_status() to authenticated;

-- Operator: flag a seller for payout review (or clear it). Clearing restarts the clock on anything already delivered.
create function public.admin_set_payout_review(p_user_id uuid, p_review boolean) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; t jsonb;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.profiles set payout_review=coalesce(p_review,false) where id=p_user_id;
  if not found then raise exception 'Member not found.'; end if;
  if not coalesce(p_review,false) then
    for purchase in select * from public.purchases where seller_id=p_user_id and escrow_status='held' and delivered_at is not null and release_after is null loop
      t:=public.seller_payout_tier(purchase.seller_id,purchase.price_cents,purchase.fulfillment_method='pickup');
      if t->>'tier'<>'flagged' then
        update public.purchases set hold_tier=t->>'tier', hold_hours=(t->>'hold_hours')::integer, release_after=now()+make_interval(hours=>(t->>'hold_hours')::integer) where id=purchase.id;
      end if;
    end loop;
  end if;
end;$$;
revoke all on function public.admin_set_payout_review(uuid,boolean) from public,anon;
grant execute on function public.admin_set_payout_review(uuid,boolean) to authenticated;

-- Operator evidence for a dispute: how it was fulfilled and what the system recorded.
create function public.admin_purchase_evidence(p_purchase_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.purchases;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.purchases where id=p_purchase_id;
  if not found then raise exception 'Purchase not found.'; end if;
  return jsonb_build_object('fulfillment_method',p.fulfillment_method,'shipped_at',p.shipped_at,'tracking_number',p.tracking_number,
    'tracking_status',p.tracking_status,'delivered_at',p.delivered_at,'release_after',p.release_after,'hold_tier',p.hold_tier,
    'handoff_verified_at',p.handoff_verified_at,'escrow_status',p.escrow_status);
end;$$;
revoke all on function public.admin_purchase_evidence(uuid) from public,anon;
grant execute on function public.admin_purchase_evidence(uuid) to authenticated;

-- Existing held pickup orders from the old two-button flow get a code; a handoff the old flow never verified starts fresh.
update public.purchases set pickup_code=lpad((floor(random()*1000000))::int::text,6,'0'), seller_marked_picked_up_at=null, buyer_confirmed_pickup_at=null
  where fulfillment_method='pickup' and escrow_status='held' and pickup_code is null;

commit;
