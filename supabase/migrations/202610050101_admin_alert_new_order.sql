begin;

-- Tell the operator whenever an order is recorded (shipped or pickup, any seller, including King's Collection items, which have no buy
-- request and so never trigger "Admin Alert: Buy Request"). Same pattern as the other "Admin Alert: ..." events: notify_klaviyo never
-- raises, so an alert problem can never block an order. Only display names are sent, never email addresses.
create or replace function public.alert_operator_new_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare item_title text; buyer text; seller text;
begin
  select title into item_title from public.listings where id=new.listing_id;
  select display_name into buyer from public.profiles where id=new.buyer_id;
  select display_name into seller from public.profiles where id=new.seller_id;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Order',jsonb_build_object(
    'purchase_id',new.id,'listing_id',new.listing_id,'title',item_title,'price_cents',new.price_cents,
    'fulfillment',case when new.fulfillment_method='pickup' then 'Local pickup' else 'Shipped' end,
    'buyer_name',coalesce(buyer,'Collector'),'seller_name',coalesce(seller,'Collector')));
  return null;
end;$$;
revoke all on function public.alert_operator_new_order() from public,anon,authenticated;
drop trigger if exists alert_operator_new_order on public.purchases;
create trigger alert_operator_new_order after insert on public.purchases
  for each row execute function public.alert_operator_new_order();

commit;
