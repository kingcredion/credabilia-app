begin;

-- Local pickup, part 2: checkout. reserve_listing_checkout gains a p_fulfillment_method param --
-- when 'pickup', the hard shipping-address requirement is skipped entirely (still validates the
-- listing actually offers pickup). The confirmed-availability-request check stays exactly as-is,
-- fulfillment-agnostic, since it already runs after the buyer/seller availability handshake.

alter table public.checkout_sessions
  add column fulfillment_method text not null default 'ship' check (fulfillment_method in ('ship','pickup')),
  add column pickup_station_id uuid references public.pickup_stations(id);

-- purchases gains the same two columns here (finalize_checkout_session below snapshots them from
-- the checkout session) -- the write-once pickup-handoff columns (seller_marked_picked_up_at,
-- buyer_confirmed_pickup_at) are added separately in 202609300060_pickup_escrow.sql, where they're
-- first used.
alter table public.purchases
  add column fulfillment_method text not null default 'ship' check (fulfillment_method in ('ship','pickup')),
  add column pickup_station_id uuid references public.pickup_stations(id);

-- Current live signature confirmed at 202609300033_buy_availability_confirmation.sql:113-161 --
-- drop it (a changed param count needs this, same rule as create_listing_with_details above).
drop function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean);

create function public.reserve_listing_checkout(
  p_listing_id uuid, p_shipping_address jsonb, p_apply_credit_cents bigint default 0,
  p_want_insurance boolean default true, p_fulfillment_method text default 'ship'
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; seller_profile public.profiles;
  new_id uuid; balance bigint; credit_to_apply bigint:=0; avail public.availability_requests; station public.pickup_stations;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;
  if p_fulfillment_method not in ('ship','pickup') then raise exception 'Invalid fulfillment method.'; end if;

  if p_fulfillment_method='ship' then
    if coalesce(btrim(p_shipping_address->>'name'),'')='' or coalesce(btrim(p_shipping_address->>'street1'),'')='' or coalesce(btrim(p_shipping_address->>'city'),'')=''
       or coalesce(btrim(p_shipping_address->>'state'),'')='' or coalesce(btrim(p_shipping_address->>'zip'),'')='' or coalesce(btrim(p_shipping_address->>'country'),'')='' then
      raise exception 'Fill in all required address fields.';
    end if;
  end if;
  if coalesce(p_apply_credit_cents,0)<0 then raise exception 'Invalid credit amount.'; end if;

  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();

  select * into item from public.listings where id=p_listing_id for update;
  if not found then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  if p_fulfillment_method='pickup' then
    if not item.pickup_enabled or item.pickup_station_id is null then raise exception 'This item is not available for pickup.'; end if;
    select * into station from public.pickup_stations where id=item.pickup_station_id;
  end if;

  select * into avail from public.availability_requests where listing_id=p_listing_id and buyer_id=actor and status='confirmed' and expires_at>now() order by created_at desc limit 1;
  if not found then raise exception 'Ask the seller to confirm this item is still available before buying.'; end if;
  if item.status<>'pending' then raise exception 'This item is not available to buy.'; end if;

  select * into seller_account from public.stripe_accounts where user_id=item.seller_id;
  if not found or not seller_account.charges_enabled then raise exception 'This seller has not finished payment setup yet.'; end if;
  select * into seller_profile from public.profiles where id=item.seller_id;

  if coalesce(p_apply_credit_cents,0)>0 then
    select coalesce(sum(amount_cents),0) into balance from public.credit_events where user_id=actor;
    if p_apply_credit_cents>balance then raise exception 'You do not have that much credit available.'; end if;
    credit_to_apply:=least(p_apply_credit_cents, public.platform_fee_cents(item.price_cents));
  end if;

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at,shipping_address,applied_credit_cents,free_shipping,want_insurance,fulfillment_method,pickup_station_id)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes',
      case when p_fulfillment_method='pickup' then null else p_shipping_address end,
      credit_to_apply,item.free_shipping,
      case when p_fulfillment_method='pickup' then false else coalesce(p_want_insurance,true) end,
      p_fulfillment_method, case when p_fulfillment_method='pickup' then item.pickup_station_id else null end)
    returning id into new_id;

  if credit_to_apply>0 then
    insert into public.credit_events(user_id,amount_cents,reason) values(actor,-credit_to_apply,'Applied to checkout');
  end if;

  return jsonb_build_object(
    'checkout_session_id',new_id,'price_cents',item.price_cents,'stripe_account_id',seller_account.stripe_account_id,'title',item.title,
    'applied_credit_cents',credit_to_apply,'free_shipping',item.free_shipping,'seller_shipping_address',seller_profile.shipping_address,
    'want_insurance',case when p_fulfillment_method='pickup' then false else coalesce(p_want_insurance,true) end,
    'fulfillment_method',p_fulfillment_method,
    'pickup_station',case when p_fulfillment_method='pickup' then jsonb_build_object('id',station.id,'jurisdiction',station.jurisdiction,'city',station.city,'state',station.state,'country',station.country,'notes',station.notes) else null end,
    'parcel',case when item.weight_oz is not null and item.length_in is not null and item.width_in is not null and item.height_in is not null
      then jsonb_build_object('weight_oz',item.weight_oz,'length_in',item.length_in,'width_in',item.width_in,'height_in',item.height_in)
      else null end
  );
end;$$;
revoke all on function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean,text) from public,anon;
grant execute on function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean,text) to authenticated;

-- finalize_checkout_session: unchanged fee/shipping math, now also snapshots which fulfillment
-- method was actually chosen onto the purchase row. 0-arg param list unchanged -- plain create or
-- replace. Current live body confirmed at 202609250018_escrow_and_insurance.sql:98-123.
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
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents,shipping_address,shipping_cost_cents,seller_shipping_charge_cents,applied_credit_cents,insured,insured_value_cents,insurance_cost_cents,fulfillment_method,pickup_station_id)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee,target.shipping_address,coalesce(target.shipping_cost_cents,0),seller_ship_charge,coalesce(target.applied_credit_cents,0),is_insured,insured_value,coalesce(target.insurance_cost_cents,0),target.fulfillment_method,target.pickup_station_id)
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;

commit;
