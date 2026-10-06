begin;

-- A full refund used to leave the listing marked "sold" for good, so the seller could never sell the item again. When a full refund is issued
-- (an accepted refund, an approved dispute, or a returned item) the item goes back to the seller: a fixed-price listing becomes active again,
-- and an auction goes to the seller's Ended tab where it can be relisted. A partial refund leaves the buyer holding the item, so it stays sold.
create or replace function public.mark_refund_processed(p_request_id uuid, p_stripe_refund_id text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.refund_requests; purchase public.purchases; new_escrow_status text; amount_text text; item public.listings;
begin
  select * into request from public.refund_requests where id=p_request_id and status='accepted' for update;
  if not found then raise exception 'Refund request not found or not ready to process.'; end if;
  select * into purchase from public.purchases where id=request.purchase_id;
  new_escrow_status:=case when request.offered_amount_cents is not null and request.offered_amount_cents<purchase.price_cents then 'partially_refunded' else 'refunded' end;

  update public.refund_requests set status='refunded', resolved_at=now(), resolution_note=coalesce(resolution_note,'')||' stripe_refund:'||p_stripe_refund_id where id=p_request_id;
  update public.purchases set escrow_status=new_escrow_status where id=request.purchase_id;

  if new_escrow_status='refunded' then
    select * into item from public.listings where id=purchase.listing_id for update;
    if found and item.status='sold' then
      perform set_config('app.auction_internal','1',true);
      update public.listings set status=case when item.listing_type='auction' then 'archived' else 'active' end where id=item.id;
    end if;
  end if;

  amount_text:='$'||to_char(coalesce(request.offered_amount_cents,purchase.price_cents)/100.0,'FM999,999,990.00');
  perform public.notify_order_update(request.buyer_id,'Refund Update',purchase.id,'Your refund is on its way',
    'We have issued a refund of '||amount_text||' to your original payment method. It can take a few business days to appear.');
  perform public.notify_order_update(request.seller_id,'Refund Update',purchase.id,'A refund was issued',
    'A refund of '||amount_text||' was issued to the buyer for this order.');
end;$$;
revoke all on function public.mark_refund_processed(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_refund_processed(uuid,text) to service_role;

commit;
