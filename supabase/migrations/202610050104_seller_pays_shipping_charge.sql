begin;

-- When a seller offers free shipping, the seller (not the buyer) picks the carrier service and the REAL label price comes out of their
-- payout -- the same as eBay. Until now the charge was fixed at the cheapest quote when the order was placed, which only works if the
-- seller is forced to buy the cheapest service.
--
-- purchases.seller_pays_shipping marks those orders (copied from the checkout session at payment). Orders placed before this change
-- keep the old rule (cheapest service only, charge already recorded).

alter table public.purchases add column seller_pays_shipping boolean not null default false;

create or replace function public.copy_shipping_service_to_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
declare session_row public.checkout_sessions;
begin
  if new.stripe_checkout_session_id is not null then
    select * into session_row from public.checkout_sessions where stripe_checkout_session_id=new.stripe_checkout_session_id;
    if found then
      new.shipping_provider:=session_row.shipping_provider;
      new.shipping_service:=session_row.shipping_service;
      new.shipping_service_name:=session_row.shipping_service_name;
      new.shipping_quote_cents:=session_row.shipping_quote_cents;
      new.seller_pays_shipping:=coalesce(session_row.free_shipping,false);
    end if;
  end if;
  return new;
end;$$;

-- Called by shippo-buy-label (service role) once the label is bought: the seller's shipping charge becomes the label's actual
-- shipping price (insurance is paid by the buyer and is not part of it). seller_payout_cents is generated from it, so the payout
-- shrinks automatically. Refuses a charge bigger than the seller's payout would allow.
create function public.set_seller_shipping_charge(p_purchase_id uuid, p_seller_id uuid, p_charge_cents bigint) returns void
language plpgsql security definer set search_path='' as $$
declare target public.purchases;
begin
  if p_charge_cents is null or p_charge_cents<0 then raise exception 'Invalid shipping charge.'; end if;
  select * into target from public.purchases where id=p_purchase_id and seller_id=p_seller_id for update;
  if not found then raise exception 'Sale not found.'; end if;
  if not target.seller_pays_shipping then raise exception 'This order does not charge shipping to the seller.'; end if;
  if target.escrow_status<>'held' then raise exception 'This order is no longer held.'; end if;
  if target.price_cents-target.platform_fee_cents-p_charge_cents<0 then raise exception 'The label costs more than your payout from this sale.'; end if;
  update public.purchases set seller_shipping_charge_cents=p_charge_cents where id=p_purchase_id;
end;$$;
revoke all on function public.set_seller_shipping_charge(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_seller_shipping_charge(uuid,uuid,bigint) to service_role;

commit;
