begin;

-- Email the seller when a buyer asks to buy (event "Buy Request Received" -> Klaviyo flow). Until now a seller was only told
-- by push and text message, and text messages are not deliverable until the Twilio toll-free registration is approved.
-- Same function as the live one plus a notify_klaviyo call. The event carries no buyer identity, matching the push/SMS wording.
create or replace function public.request_to_buy(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; new_id uuid; new_expires timestamptz;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;

  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();
  update public.availability_requests set status='expired' where listing_id=p_listing_id and status in ('pending','confirmed') and expires_at<now();
  update public.listings set status='active' where id=p_listing_id and status='pending'
    and not exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending')
    and not exists(select 1 from public.availability_requests where listing_id=p_listing_id and status in ('pending','confirmed'));

  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.listing_type='auction' then raise exception 'This item is up for auction — place a bid instead.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  new_expires:=now()+interval '24 hours';
  insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at)
    values(p_listing_id,actor,item.seller_id,'pending',new_expires)
    returning id into new_id;
  update public.listings set status='pending' where id=p_listing_id;

  perform public.notify_push(item.seller_id, 'Is "'||item.title||'" still available?', 'A buyer wants to purchase this item. Confirm or decline in your Sell dashboard.', '/?item='||p_listing_id);
  perform public.notify_sms(item.seller_id, 'Credabilia: A buyer wants to buy "'||item.title||'". Confirm in your Sell dashboard: https://credabilia.com/item/'||p_listing_id||'. Reply STOP to opt out.');
  perform public.notify_klaviyo((select email from auth.users where id=item.seller_id),'Buy Request Received',
    jsonb_build_object('listing_id',p_listing_id,'title',item.title,'price_cents',item.price_cents));
  return jsonb_build_object('id',new_id,'listing_id',p_listing_id,'status','pending','expires_at',new_expires);
end;$$;

commit;
