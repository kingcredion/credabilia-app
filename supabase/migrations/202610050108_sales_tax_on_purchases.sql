begin;

-- Sales tax collected at checkout (Stripe Tax). The tax is NOT part of price_cents, the seller's payout or the platform fee: it is added on top,
-- sits in Credabilia's own Stripe balance, and is remitted to the state by Credabilia. These columns remember how much tax a payment carried and
-- the total the buyer was charged, so a partial refund can give back the matching share of tax.
alter table public.purchases
  add column tax_cents bigint not null default 0 check (tax_cents>=0),
  add column charged_cents bigint check (charged_cents is null or charged_cents>=0);

-- Called by the stripe-webhook (service role) right after an order is recorded.
create function public.record_purchase_tax(p_purchase_id uuid, p_tax_cents bigint, p_charged_cents bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_tax_cents is null or p_tax_cents<0 then raise exception 'Invalid tax amount.'; end if;
  if p_charged_cents is not null and p_charged_cents<p_tax_cents then raise exception 'Invalid charged amount.'; end if;
  update public.purchases set tax_cents=p_tax_cents,charged_cents=p_charged_cents where id=p_purchase_id;
  if not found then raise exception 'Purchase not found.'; end if;
end;$$;
revoke all on function public.record_purchase_tax(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.record_purchase_tax(uuid,bigint,bigint) to service_role;

commit;
