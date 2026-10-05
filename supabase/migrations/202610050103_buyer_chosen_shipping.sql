begin;

-- The buyer chooses the shipping service at checkout; the seller can only print the label for that service.
--
-- Before this, checkout charged the buyer the cheapest rate automatically, and the seller then saw every rate and could buy any of
-- them on the platform's Shippo account, so a seller could pick an expensive service the buyer never paid for. Now the chosen
-- carrier/service is recorded on the checkout session, copied onto the order when payment completes, and enforced by the label
-- functions (shippo-get-rates / shippo-buy-label), which only offer, and only buy, that service.

alter table public.checkout_sessions
  add column shipping_provider text,
  add column shipping_service text,
  add column shipping_service_name text,
  add column shipping_quote_cents bigint;
alter table public.purchases
  add column shipping_provider text,
  add column shipping_service text,
  add column shipping_service_name text,
  add column shipping_quote_cents bigint;

-- Called by create-checkout-session (as the buyer) once it has matched the buyer's choice against a fresh carrier quote.
create function public.attach_shipping_service(p_checkout_session_id uuid, p_provider text, p_service text, p_service_name text, p_quote_cents bigint) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  if coalesce(btrim(p_provider),'')='' or coalesce(btrim(p_service),'')='' or p_quote_cents is null or p_quote_cents<0 then raise exception 'Invalid shipping choice.'; end if;
  update public.checkout_sessions set shipping_provider=left(p_provider,60), shipping_service=left(p_service,80), shipping_service_name=left(coalesce(p_service_name,p_service),120), shipping_quote_cents=p_quote_cents
    where id=p_checkout_session_id and buyer_id=auth.uid() and status='pending';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Checkout session not found.'; end if;
end;$$;
revoke all on function public.attach_shipping_service(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.attach_shipping_service(uuid,text,text,text,bigint) to authenticated;

-- finalize_checkout_session is untouched: this trigger copies the choice onto the new order from its checkout session.
create function public.copy_shipping_service_to_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.stripe_checkout_session_id is not null then
    select shipping_provider,shipping_service,shipping_service_name,shipping_quote_cents
      into new.shipping_provider,new.shipping_service,new.shipping_service_name,new.shipping_quote_cents
      from public.checkout_sessions where stripe_checkout_session_id=new.stripe_checkout_session_id;
  end if;
  return new;
end;$$;
revoke all on function public.copy_shipping_service_to_purchase() from public,anon,authenticated;
create trigger copy_shipping_service_to_purchase before insert on public.purchases
  for each row execute function public.copy_shipping_service_to_purchase();

-- Read-only inputs for pricing shipping before a buyer commits (the checkout-shipping-options function). service_role only: it
-- includes the seller's saved address, which is used to ask the carrier for rates and is never returned to the buyer.
create function public.shipping_quote_inputs(p_listing_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item public.listings; seller_address jsonb;
begin
  select * into item from public.listings where id=p_listing_id;
  if not found then return null; end if;
  select shipping_address into seller_address from public.profiles where id=item.seller_id;
  return jsonb_build_object('seller_id',item.seller_id,'status',item.status,'title',item.title,'price_cents',item.price_cents,
    'free_shipping',item.free_shipping,'is_king',public.listing_is_king_collection(p_listing_id),'seller_shipping_address',seller_address,
    'parcel',case when item.weight_oz is not null and item.length_in is not null and item.width_in is not null and item.height_in is not null
      then jsonb_build_object('weight_oz',item.weight_oz,'length_in',item.length_in,'width_in',item.width_in,'height_in',item.height_in) else null end);
end;$$;
revoke all on function public.shipping_quote_inputs(uuid) from public,anon,authenticated;
grant execute on function public.shipping_quote_inputs(uuid) to service_role;

commit;
