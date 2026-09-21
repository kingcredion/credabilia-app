begin;

-- Credion Coins (formerly "platform credit") -----------------------------------------------
-- Previously capped at the platform fee amount, so the platform never paid out more than it
-- would have collected in fees. Now capped at 50% of the item price instead -- a real discount
-- funded by the platform itself, not just a fee waiver. This is safe to raise because the actual
-- Stripe charge (create-checkout-session/handler.js: itemAmount = priceCents - appliedCreditCents)
-- and the seller's payout (generated column: price_cents - platform_fee_cents -
-- seller_shipping_charge_cents, computed from the FULL price) were already written generically --
-- the platform's own Stripe balance absorbs the applied coins as a real cost, the seller is always
-- paid in full regardless of how much was applied. Only the cap formula needed to change.
-- Same 4-param signature as the live function (202609300033_buy_availability_confirmation.sql).
create or replace function public.reserve_listing_checkout(p_listing_id uuid, p_shipping_address jsonb, p_apply_credit_cents bigint default 0, p_want_insurance boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; seller_profile public.profiles;
  new_id uuid; balance bigint; credit_to_apply bigint:=0; avail public.availability_requests;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;
  if coalesce(btrim(p_shipping_address->>'name'),'')='' or coalesce(btrim(p_shipping_address->>'street1'),'')='' or coalesce(btrim(p_shipping_address->>'city'),'')=''
     or coalesce(btrim(p_shipping_address->>'state'),'')='' or coalesce(btrim(p_shipping_address->>'zip'),'')='' or coalesce(btrim(p_shipping_address->>'country'),'')='' then
    raise exception 'Fill in all required address fields.';
  end if;
  if coalesce(p_apply_credit_cents,0)<0 then raise exception 'Invalid credit amount.'; end if;

  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();

  select * into item from public.listings where id=p_listing_id for update;
  if not found then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  select * into avail from public.availability_requests where listing_id=p_listing_id and buyer_id=actor and status='confirmed' and expires_at>now() order by created_at desc limit 1;
  if not found then raise exception 'Ask the seller to confirm this item is still available before buying.'; end if;
  if item.status<>'pending' then raise exception 'This item is not available to buy.'; end if;

  select * into seller_account from public.stripe_accounts where user_id=item.seller_id;
  if not found or not seller_account.charges_enabled then raise exception 'This seller has not finished payment setup yet.'; end if;
  select * into seller_profile from public.profiles where id=item.seller_id;

  if coalesce(p_apply_credit_cents,0)>0 then
    select coalesce(sum(amount_cents),0) into balance from public.credit_events where user_id=actor;
    if p_apply_credit_cents>balance then raise exception 'You do not have that much credit available.'; end if;
    credit_to_apply:=least(p_apply_credit_cents, round(item.price_cents*0.5));
  end if;

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at,shipping_address,applied_credit_cents,free_shipping,want_insurance)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes',p_shipping_address,credit_to_apply,item.free_shipping,coalesce(p_want_insurance,true))
    returning id into new_id;

  if credit_to_apply>0 then
    insert into public.credit_events(user_id,amount_cents,reason) values(actor,-credit_to_apply,'Applied to checkout');
  end if;

  return jsonb_build_object(
    'checkout_session_id',new_id,'price_cents',item.price_cents,'stripe_account_id',seller_account.stripe_account_id,'title',item.title,
    'applied_credit_cents',credit_to_apply,'free_shipping',item.free_shipping,'seller_shipping_address',seller_profile.shipping_address,
    'want_insurance',coalesce(p_want_insurance,true),
    'parcel',case when item.weight_oz is not null and item.length_in is not null and item.width_in is not null and item.height_in is not null
      then jsonb_build_object('weight_oz',item.weight_oz,'length_in',item.length_in,'width_in',item.width_in,'height_in',item.height_in)
      else null end
  );
end;$$;

commit;
