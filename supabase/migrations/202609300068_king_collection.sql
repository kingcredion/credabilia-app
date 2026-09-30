begin;

-- King's Collection: a listing published by a seeded operator account (public.operators, same
-- identity is_operator() already checks) is treated as pre-vetted, always-in-stock inventory --
-- skip the buyer/seller availability handshake entirely and let a signed-in buyer purchase it
-- outright. This exists specifically to bootstrap Credabilia's catalog before there's a real
-- seller community: the operator IS the current inventory source, and there's no other buyer to
-- race against, so "ask the seller if it's still available" is pure friction with nothing to protect.
create or replace function public.reserve_listing_checkout(
  p_listing_id uuid, p_shipping_address jsonb, p_apply_credit_cents bigint default 0,
  p_want_insurance boolean default true, p_fulfillment_method text default 'ship'
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; seller_profile public.profiles;
  new_id uuid; balance bigint; credit_to_apply bigint:=0; avail public.availability_requests; station public.pickup_stations;
  king boolean;
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

  king := exists(select 1 from public.operators where user_id=item.seller_id);

  if king then
    if item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
    update public.listings set status='pending' where id=p_listing_id;
  else
    select * into avail from public.availability_requests where listing_id=p_listing_id and buyer_id=actor and status='confirmed' and expires_at>now() order by created_at desc limit 1;
    if not found then raise exception 'Ask the seller to confirm this item is still available before buying.'; end if;
    if item.status<>'pending' then raise exception 'This item is not available to buy.'; end if;
  end if;

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
    'pickup_station',case when p_fulfillment_method='pickup' then jsonb_build_object('id',station.id,'jurisdiction',station.jurisdiction,'city',station.city,'state',station.state,'country',station.country,'notes',station.notes) else null end
  );
end;$$;
revoke all on function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean,text) from public,anon;
grant execute on function public.reserve_listing_checkout(uuid,jsonb,bigint,boolean,text) to authenticated;

-- Surface the flag so the client can badge/style these listings and skip straight to checkout.
create or replace function public.browse_listings_with_certificates(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object(
  'attributes',l.attributes,'tags',l.tags,'seller_charges_enabled',coalesce(sa.charges_enabled,false),
  'seller_member_since',p.created_at,
  'seller_sales_count',(select count(*) from public.purchases where seller_id=l.seller_id),
  'seller_rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=l.seller_id),
  'seller_rating_count',(select count(*) from public.seller_ratings where seller_id=l.seller_id),
  'pickup_enabled',l.pickup_enabled,
  'pickup_station',case when l.pickup_enabled then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
  'king_collection',exists(select 1 from public.operators op where op.user_id=l.seller_id)
) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_listings_with_media(p_limit,p_after_created_at,p_after_id)) with ordinality as items(item,position)
join public.listings l on l.id=(item->>'id')::uuid
join public.profiles p on p.id=l.seller_id
left join public.stripe_accounts sa on sa.user_id=l.seller_id
left join public.pickup_stations ps on ps.id=l.pickup_station_id;
$$;
revoke all on function public.browse_listings_with_certificates(integer,timestamptz,uuid) from public;
grant execute on function public.browse_listings_with_certificates(integer,timestamptz,uuid) to anon,authenticated;

commit;
