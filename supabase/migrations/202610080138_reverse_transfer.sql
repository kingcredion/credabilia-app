-- One-click recovery of a seller's payout after a card chargeback on an order the seller was already paid for.
-- The Stripe call itself is made by the reverse-transfer edge function; these two functions decide who may ask and record the result.
begin;

-- Operator only: what could be reversed for this order, and whether it is allowed. Only an order with a recorded chargeback, whose seller
-- was already paid, and whose transfer has not already been reversed, is eligible.
create function public.admin_transfer_reversal_info(p_purchase_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.purchases; has_dispute boolean; paid_before boolean; already boolean;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.purchases where id=p_purchase_id;
  if not found then raise exception 'Purchase not found.'; end if;
  select count(*)>0, coalesce(bool_or(d.seller_already_paid),false), coalesce(bool_or(d.transfer_reversed),false)
    into has_dispute, paid_before, already from public.payment_disputes d where d.purchase_id=p.id;
  return jsonb_build_object('purchase_id',p.id,'transfer_id',p.stripe_transfer_id,'escrow_status',p.escrow_status,
    'has_dispute',has_dispute,'already_reversed',already,
    'eligible',(p.stripe_transfer_id is not null and p.escrow_status='released' and has_dispute and paid_before and not already));
end;$$;
revoke all on function public.admin_transfer_reversal_info(uuid) from public,anon;
grant execute on function public.admin_transfer_reversal_info(uuid) to authenticated;

-- Called by the edge function after Stripe reversed the transfer.
create function public.record_transfer_reversal(p_purchase_id uuid, p_reversal_id text, p_amount_cents bigint, p_operator uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.payment_disputes set transfer_reversed=true, updated_at=now() where purchase_id=p_purchase_id;
  insert into public.order_notes(purchase_id,author_id,note)
    values(p_purchase_id,p_operator,'Seller payout taken back after a chargeback: $'||to_char(coalesce(p_amount_cents,0)/100.0,'FM999999990.00')||' (Stripe reversal '||coalesce(p_reversal_id,'unknown')||').');
end;$$;
revoke all on function public.record_transfer_reversal(uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.record_transfer_reversal(uuid,text,bigint,uuid) to service_role;

commit;
