begin;

-- Email the buyer when the seller confirms the item is still available (event "Request Confirmed" -> Klaviyo flow).
-- Until now the buyer was only told by push and text message, and text messages are not deliverable until the Twilio
-- toll-free registration is approved. Same function as the live one (migration 073) plus one notify_klaviyo call on the
-- confirmed branch. A decline sends no email yet. The event carries no seller identity.
create or replace function public.respond_to_buy_request(p_request_id uuid, p_available boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.availability_requests; item public.listings; new_status text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.availability_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been answered.'; end if;
  if request.expires_at<now() then raise exception 'This request has expired.'; end if;

  select * into item from public.listings where id=request.listing_id;
  new_status:=case when p_available then 'confirmed' else 'declined' end;
  update public.availability_requests set status=new_status, responded_at=now() where id=p_request_id;

  if p_available then
    perform public.notify_push(request.buyer_id, '"'||item.title||'" is still available', 'Complete your purchase before this expires.', '/?item='||request.listing_id);
    perform public.notify_sms(request.buyer_id, 'Credabilia: "'||item.title||'" is still available! Complete your purchase: https://credabilia.com/item/'||request.listing_id||'. Reply STOP to opt out.');
    perform public.notify_klaviyo((select email from auth.users where id=request.buyer_id),'Request Confirmed',
      jsonb_build_object('listing_id',request.listing_id,'title',item.title,'price_cents',item.price_cents));
  else
    update public.listings set status='active' where id=request.listing_id and status='pending';
    perform public.notify_push(request.buyer_id, '"'||item.title||'" is no longer available', 'The seller let us know this item has already sold elsewhere.', '/?item='||request.listing_id);
    perform public.notify_sms(request.buyer_id, 'Credabilia: "'||item.title||'" is no longer available. Reply STOP to opt out.');
  end if;
  return jsonb_build_object('id',p_request_id,'status',new_status);
end;$$;

commit;
