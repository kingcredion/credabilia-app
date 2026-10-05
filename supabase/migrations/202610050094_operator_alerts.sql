begin;

-- More "Admin Alert: ..." events to kingcredion@credabilia.com (same pattern as New User / New Dispute / New Report / New Support
-- Message). Each is sent through notify_klaviyo, which never raises, so an alert problem can never block the action that caused it.

-- Edge functions (stripe webhook, refund) report a payment problem through this. service_role only, and it can only send
-- "Admin Alert: ..." events to the operator, so it cannot be used to email anyone else.
create or replace function public.notify_operator_alert(p_event text, p_properties jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_event is null or p_event not like 'Admin Alert: %' or length(p_event)>80 then raise exception 'Not an operator alert event.'; end if;
  perform public.notify_klaviyo('kingcredion@credabilia.com', p_event, coalesce(p_properties,'{}'::jsonb));
end;$$;
revoke all on function public.notify_operator_alert(text,jsonb) from public,anon,authenticated;
grant execute on function public.notify_operator_alert(text,jsonb) to service_role;

-- New listing / listing held for review. A listing is inserted as 'active' and only flipped to 'needs_review' later in the same
-- transaction, so the trigger is deferred and reads the final row.
create or replace function public.alert_operator_new_listing() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.listings; seller text;
begin
  select * into item from public.listings where id=new.id;
  if not found or item.status not in ('active','needs_review') then return null; end if;
  select display_name into seller from public.profiles where id=item.seller_id;
  perform public.notify_klaviyo('kingcredion@credabilia.com',
    case when item.status='needs_review' then 'Admin Alert: Listing Review' else 'Admin Alert: New Listing' end,
    jsonb_build_object('listing_id',item.id,'title',item.title,'price_cents',item.price_cents,'category',item.category,
      'seller_name',coalesce(seller,'Collector'),'reason',coalesce(item.needs_review_reason,'')));
  return null;
end;$$;
revoke all on function public.alert_operator_new_listing() from public,anon,authenticated;
drop trigger if exists alert_operator_new_listing on public.listings;
create constraint trigger alert_operator_new_listing after insert on public.listings
  deferrable initially deferred for each row execute function public.alert_operator_new_listing();

-- Refund requested.
create or replace function public.alert_operator_refund_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text; buyer text; seller text;
begin
  select * into purchase from public.purchases where id=new.purchase_id;
  if not found then return null; end if;
  select title into item_title from public.listings where id=purchase.listing_id;
  select display_name into buyer from public.profiles where id=new.buyer_id;
  select display_name into seller from public.profiles where id=new.seller_id;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Refund Request',jsonb_build_object(
    'listing_id',purchase.listing_id,'title',item_title,'price_cents',purchase.price_cents,'reason',new.reason,
    'buyer_name',coalesce(buyer,'Collector'),'seller_name',coalesce(seller,'Collector')));
  return null;
end;$$;
revoke all on function public.alert_operator_refund_request() from public,anon,authenticated;
drop trigger if exists alert_operator_refund_request on public.refund_requests;
create trigger alert_operator_refund_request after insert on public.refund_requests
  for each row execute function public.alert_operator_refund_request();

-- First buy request on a listing (later requests on the same listing are not alerted).
create or replace function public.alert_operator_buy_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.listings; buyer text; seller text;
begin
  if new.status<>'pending' or exists(select 1 from public.availability_requests where listing_id=new.listing_id and id<>new.id) then return null; end if;
  select * into item from public.listings where id=new.listing_id;
  if not found then return null; end if;
  select display_name into buyer from public.profiles where id=new.buyer_id;
  select display_name into seller from public.profiles where id=new.seller_id;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Buy Request',jsonb_build_object(
    'listing_id',item.id,'title',item.title,'price_cents',item.price_cents,
    'buyer_name',coalesce(buyer,'Collector'),'seller_name',coalesce(seller,'Collector')));
  return null;
end;$$;
revoke all on function public.alert_operator_buy_request() from public,anon,authenticated;
drop trigger if exists alert_operator_buy_request on public.availability_requests;
create trigger alert_operator_buy_request after insert on public.availability_requests
  for each row execute function public.alert_operator_buy_request();

commit;
