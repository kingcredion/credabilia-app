begin;

-- Regression fix. finalize_checkout_session lost its Klaviyo events when 202609300059 / 202609300064 re-created it (the function kept
-- being copied from the previous copy), so real orders stopped sending the buyer's "Purchase Completed" receipt and the seller's
-- "Item Sold" notice. This restores them and adds the two meetup emails for pickup orders: "Pickup Meetup" (buyer) and "Pickup Sale"
-- (seller). Everything else is the 202610050095 function.
create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint; seller_ship_charge bigint; is_insured boolean; insured_value bigint; conv_id uuid; code text; item_title text; station public.pickup_stations; props jsonb;
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

  -- Emails (notify_klaviyo never raises, so a Klaviyo problem can never block a purchase). Shipped orders: the buyer's receipt and
  -- the seller's "ship it" notice. Pickup orders get meetup emails instead (where to meet, inspect first, the handoff code), since
  -- the shipping wording does not apply. Neither side's email carries the other party's identity.
  select title into item_title from public.listings where id=target.listing_id;
  props:=jsonb_build_object('purchase_id',new_id,'listing_id',target.listing_id,'title',item_title,'price_cents',target.price_cents);
  if target.fulfillment_method='pickup' then
    select * into station from public.pickup_stations where id=target.pickup_station_id;
    props:=props||jsonb_build_object('station_name',station.jurisdiction,'station_city',station.city,'station_state',station.state,
      'conversation_url','https://credabilia.com/?conversation='||conv_id);
    perform public.notify_klaviyo((select email from auth.users where id=target.buyer_id),'Pickup Meetup',props);
    perform public.notify_klaviyo((select email from auth.users where id=target.seller_id),'Pickup Sale',props);
  else
    perform public.notify_klaviyo((select email from auth.users where id=target.buyer_id),'Purchase Completed',props);
    perform public.notify_klaviyo((select email from auth.users where id=target.seller_id),'Item Sold',props);
  end if;

  return new_id;
end;$$;

commit;
