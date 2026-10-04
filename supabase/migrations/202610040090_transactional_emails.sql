begin;

-- Six more customer emails (Klaviyo events): Outbid, New Message, Item Shipped, Item Delivered, Refund Update, Dispute Update.
-- Every function below is the live one with notify_klaviyo calls added; nothing else about its behaviour changes. Live bodies:
-- place_bid (073), send_message (064), record_shipment / update_tracking_status (014), request_refund / offer_partial_refund /
-- require_return (032), respond_to_refund_request (045), mark_refund_processed (024), admin_resolve_refund_request (041).
-- No event carries the other party's email address, id or message text (New Message includes the sender's public display name).

-- Send an event to a user's email address (never callable from a client).
create or replace function public.notify_klaviyo_user(p_user_id uuid, p_event text, p_properties jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.notify_klaviyo((select email from auth.users where id=p_user_id), p_event, p_properties);
end;$$;
revoke all on function public.notify_klaviyo_user(uuid,text,jsonb) from public,anon,authenticated;

-- Refund Update / Dispute Update share one shape (headline + message), so each metric needs a single Klaviyo template.
create or replace function public.notify_order_update(p_user_id uuid, p_event text, p_purchase_id uuid, p_headline text, p_message text) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text;
begin
  select * into purchase from public.purchases where id=p_purchase_id;
  if not found then return; end if;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_klaviyo_user(p_user_id, p_event, jsonb_build_object(
    'listing_id',purchase.listing_id,'title',item_title,'price_cents',purchase.price_cents,
    'headline',p_headline,'message',p_message,'action_url','https://credabilia.com/?item='||purchase.listing_id));
end;$$;
revoke all on function public.notify_order_update(uuid,text,uuid,text,text) from public,anon,authenticated;

-- Outbid -------------------------------------------------------------------------------------------------------------------
create or replace function public.place_bid(p_listing_id uuid, p_amount_cents bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; new_bid public.bids; minimum bigint; previous_bidder uuid;
begin
  if actor is null then raise exception 'Sign in to bid' using errcode='42501'; end if;
  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' or item.listing_type<>'auction' then raise exception 'This auction is not available for bidding.'; end if;
  if item.auction_ends_at<=now() then raise exception 'This auction has ended.'; end if;
  if item.seller_id=actor then raise exception 'You cannot bid on your own listing.'; end if;
  minimum:=case when item.bid_count=0 then item.price_cents else item.price_cents+100 end;
  if p_amount_cents<minimum then raise exception 'Enter a higher bid.'; end if;
  select bidder_id into previous_bidder from public.bids where listing_id=p_listing_id order by amount_cents desc, created_at asc limit 1;
  insert into public.bids(listing_id,bidder_id,amount_cents) values(p_listing_id,actor,p_amount_cents) returning * into new_bid;
  update public.listings set price_cents=p_amount_cents,bid_count=bid_count+1 where id=p_listing_id;
  if previous_bidder is not null and previous_bidder<>actor then
    perform public.notify_push(previous_bidder, 'You''ve been outbid on "'||item.title||'"', 'The current bid is now $'||to_char(p_amount_cents/100.0,'FM999,999,990.00')||'.', '/?item='||p_listing_id);
    perform public.notify_sms(previous_bidder, 'Credabilia: You''ve been outbid on "'||item.title||'". Current bid: $'||to_char(p_amount_cents/100.0,'FM999,999,990.00')||'. Bid again: https://credabilia.com/item/'||p_listing_id||'. Reply STOP to opt out.');
    perform public.notify_klaviyo_user(previous_bidder,'Outbid',jsonb_build_object('listing_id',p_listing_id,'title',item.title,'amount_cents',p_amount_cents));
  end if;
  return jsonb_build_object('id',new_bid.id,'amount_cents',new_bid.amount_cents,'bid_count',item.bid_count+1);
end;$$;

-- New Message --------------------------------------------------------------------------------------------------------------
-- One email per unread streak: skipped while the recipient still has an earlier unread message from the same sender in this
-- conversation, so a burst of messages is a single email. The text of the message is never emailed.
create or replace function public.send_message(p_conversation_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz; sender_name text;
  conv public.conversations; recipient uuid; recipient_last_read timestamptz; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  select * into conv from public.conversations where id=p_conversation_id and (buyer_id=actor or seller_id=actor);
  if not found then raise exception 'Conversation not found.'; end if;
  recipient:=case when conv.buyer_id=actor then conv.seller_id else conv.buyer_id end;
  recipient_last_read:=case when conv.buyer_id=actor then conv.seller_last_read_at else conv.buyer_last_read_at end;
  if exists(select 1 from public.blocks where (blocker_id=actor and blocked_id=recipient) or (blocker_id=recipient and blocked_id=actor)) then
    raise exception 'You cannot message this user.';
  end if;
  insert into public.messages(conversation_id,sender_id,body) values(p_conversation_id,actor,clean) returning id,created_at into new_id,new_created;
  select display_name into sender_name from public.profiles where id=actor;
  perform public.notify_push(recipient, coalesce(sender_name,'A collector')||' sent you a message', left(clean,120), '/?conversation='||p_conversation_id);
  if not exists(select 1 from public.messages where conversation_id=p_conversation_id and sender_id=actor and id<>new_id
                  and created_at>coalesce(recipient_last_read,'-infinity'::timestamptz)) then
    select title into item_title from public.listings where id=conv.listing_id;
    perform public.notify_klaviyo_user(recipient,'New Message',jsonb_build_object(
      'listing_id',conv.listing_id,'title',item_title,'sender_name',coalesce(sender_name,'A collector'),
      'conversation_url','https://credabilia.com/?conversation='||p_conversation_id));
  end if;
  return jsonb_build_object('id',new_id,'body',clean,'created_at',new_created,'sender_id',actor,'sender_name',sender_name);
end;$$;

-- Item Shipped / Item Delivered ----------------------------------------------------------------------------------------------
create or replace function public.record_shipment(p_purchase_id uuid, p_shippo_transaction_id text, p_tracking_number text, p_tracking_url text, p_label_url text) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and seller_id=auth.uid();
  if not found then raise exception 'Sale not found.'; end if;
  update public.purchases set shippo_transaction_id=p_shippo_transaction_id, tracking_number=p_tracking_number, tracking_url=p_tracking_url, label_url=p_label_url, shipped_at=now()
    where id=p_purchase_id;
  if purchase.shipped_at is null then
    select title into item_title from public.listings where id=purchase.listing_id;
    perform public.notify_klaviyo_user(purchase.buyer_id,'Item Shipped',jsonb_build_object(
      'listing_id',purchase.listing_id,'title',item_title,'tracking_number',p_tracking_number,'tracking_url',p_tracking_url));
  end if;
end;$$;

create or replace function public.update_tracking_status(p_tracking_number text, p_tracking_status text) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text;
begin
  for purchase in select * from public.purchases where tracking_number=p_tracking_number loop
    update public.purchases set tracking_status=p_tracking_status where id=purchase.id;
    if p_tracking_status='DELIVERED' and purchase.tracking_status is distinct from 'DELIVERED' then
      select title into item_title from public.listings where id=purchase.listing_id;
      perform public.notify_klaviyo_user(purchase.buyer_id,'Item Delivered',jsonb_build_object(
        'listing_id',purchase.listing_id,'title',item_title,'tracking_url',purchase.tracking_url));
    end if;
  end loop;
end;$$;

-- Refund Update ------------------------------------------------------------------------------------------------------------
create or replace function public.request_refund(p_purchase_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean text; new_id uuid; new_created timestamptz; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_reason);
  if clean='' or length(clean)>2000 then raise exception 'Explain the issue in 1 to 2000 characters.'; end if;

  select * into purchase from public.purchases where id=p_purchase_id and buyer_id=actor;
  if not found then raise exception 'Purchase not found.'; end if;
  if purchase.escrow_status='refunded' then raise exception 'This order has already been refunded.'; end if;
  if exists(select 1 from public.refund_requests where purchase_id=p_purchase_id and status in ('pending','contested','accepted')) then
    raise exception 'A refund request is already open for this order.';
  end if;

  insert into public.refund_requests(purchase_id,buyer_id,seller_id,reason)
    values(p_purchase_id,actor,purchase.seller_id,clean)
    returning id,created_at into new_id,new_created;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(purchase.seller_id, 'Refund requested for "'||item_title||'"', clean, '/?item='||purchase.listing_id);
  perform public.notify_order_update(purchase.seller_id,'Refund Update',p_purchase_id,'A refund was requested',
    'A buyer has asked for a refund on this order. Open your sales to accept, offer a partial refund or send it to our team.');
  return jsonb_build_object('id',new_id,'status','pending','reason',clean,'created_at',new_created);
end;$$;

create or replace function public.offer_partial_refund(p_request_id uuid, p_amount_cents bigint, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; purchase public.purchases; clean text; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;
  select * into purchase from public.purchases where id=request.purchase_id;
  if p_amount_cents<=0 or p_amount_cents>=purchase.price_cents then raise exception 'Enter a partial amount less than the item price.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;

  update public.refund_requests set status='partial_offered', offered_amount_cents=p_amount_cents, seller_response=clean where id=p_request_id;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(request.buyer_id, 'Partial refund offered for "'||item_title||'"', 'A partial refund has been offered for your order.', '/?item='||purchase.listing_id);
  perform public.notify_order_update(request.buyer_id,'Refund Update',purchase.id,'A partial refund was offered',
    'The seller has offered you a partial refund of $'||to_char(p_amount_cents/100.0,'FM999,999,990.00')||' for this order. Open your order to accept or decline.');
  return jsonb_build_object('id',p_request_id,'status','partial_offered','offered_amount_cents',p_amount_cents,'seller_response',clean);
end;$$;

create or replace function public.require_return(p_request_id uuid, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; purchase public.purchases; clean text; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;

  update public.refund_requests set status='return_required', seller_response=clean where id=p_request_id;
  select * into purchase from public.purchases where id=request.purchase_id;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(request.buyer_id, 'Ship "'||item_title||'" back to get your refund', 'A return shipment is needed to complete your refund.', '/?item='||purchase.listing_id);
  perform public.notify_order_update(request.buyer_id,'Refund Update',purchase.id,'Please ship the item back',
    'Your refund will be issued once the item is returned. Open your order to get the return shipping label.');
  return jsonb_build_object('id',p_request_id,'status','return_required','seller_response',clean);
end;$$;

create or replace function public.mark_refund_processed(p_request_id uuid, p_stripe_refund_id text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.refund_requests; purchase public.purchases; new_escrow_status text; amount_text text;
begin
  select * into request from public.refund_requests where id=p_request_id and status='accepted' for update;
  if not found then raise exception 'Refund request not found or not ready to process.'; end if;
  select * into purchase from public.purchases where id=request.purchase_id;
  new_escrow_status:=case when request.offered_amount_cents is not null and request.offered_amount_cents<purchase.price_cents then 'partially_refunded' else 'refunded' end;

  update public.refund_requests set status='refunded', resolved_at=now(), resolution_note=coalesce(resolution_note,'')||' stripe_refund:'||p_stripe_refund_id where id=p_request_id;
  update public.purchases set escrow_status=new_escrow_status where id=request.purchase_id;

  amount_text:='$'||to_char(coalesce(request.offered_amount_cents,purchase.price_cents)/100.0,'FM999,999,990.00');
  perform public.notify_order_update(request.buyer_id,'Refund Update',purchase.id,'Your refund is on its way',
    'We have issued a refund of '||amount_text||' to your original payment method. It can take a few business days to appear.');
  perform public.notify_order_update(request.seller_id,'Refund Update',purchase.id,'A refund was issued',
    'A refund of '||amount_text||' was issued to the buyer for this order.');
end;$$;

-- Dispute Update -----------------------------------------------------------------------------------------------------------
create or replace function public.respond_to_refund_request(p_request_id uuid, p_accept boolean, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; clean text; new_status text; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;
  new_status:=case when p_accept then 'accepted' else 'contested' end;

  update public.refund_requests set status=new_status, seller_response=clean where id=p_request_id;
  if new_status='contested' then
    select l.title into item_title from public.purchases p join public.listings l on l.id=p.listing_id where p.id=request.purchase_id;
    perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Dispute',jsonb_build_object('refund_request_id',p_request_id,'title',item_title,'seller_response',clean));
    perform public.notify_order_update(request.buyer_id,'Dispute Update',request.purchase_id,'Our team is reviewing your request',
      'The seller disagreed with your refund request, so it has been passed to our team. We will review both sides and email you the decision.');
    perform public.notify_order_update(request.seller_id,'Dispute Update',request.purchase_id,'Our team is reviewing this dispute',
      'You disagreed with the refund request, so it has been passed to our team. We will review both sides and email you the decision.');
  end if;
  return jsonb_build_object('id',p_request_id,'status',new_status,'seller_response',clean);
end;$$;

create or replace function public.admin_resolve_refund_request(p_request_id uuid, p_action text, p_amount_cents bigint default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.refund_requests; purchase public.purchases; clean_note text; service_key text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_action not in ('approve','deny') then raise exception 'Invalid action.'; end if;
  select * into request from public.refund_requests where id=p_request_id for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status in ('refunded','denied') then raise exception 'This request has already been resolved.'; end if;

  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  if clean_note is not null and length(clean_note)>2000 then raise exception 'Keep the note under 2000 characters.'; end if;

  if p_action='deny' then
    update public.refund_requests set status='denied', resolution_note=clean_note, resolved_at=now() where id=p_request_id;
    perform public.notify_order_update(request.buyer_id,'Dispute Update',request.purchase_id,'Your refund request was not approved',
      'After reviewing both sides, our team did not approve this refund request.');
    perform public.notify_order_update(request.seller_id,'Dispute Update',request.purchase_id,'The dispute was decided in your favor',
      'After reviewing both sides, our team did not approve the refund request. Nothing further is needed.');
    return jsonb_build_object('id',p_request_id,'status','denied');
  end if;

  select * into purchase from public.purchases where id=request.purchase_id;
  if p_amount_cents is not null and (p_amount_cents<=0 or p_amount_cents>=purchase.price_cents) then
    raise exception 'Enter a partial amount less than the item price.';
  end if;

  update public.refund_requests set status='accepted', offered_amount_cents=p_amount_cents, resolution_note=clean_note where id=p_request_id;
  -- The buyer is emailed by the Refund Update when the refund is actually issued; only the seller needs the decision here.
  perform public.notify_order_update(request.seller_id,'Dispute Update',request.purchase_id,'The dispute was decided for the buyer',
    'After reviewing both sides, our team approved a refund for the buyer.');

  select decrypted_secret into service_key from vault.decrypted_secrets where name='service_role_key';
  if service_key is not null then
    perform net.http_post(
      url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/process-refund',
      headers:=jsonb_build_object('Authorization','Bearer '||service_key,'Content-Type','application/json'),
      body:=jsonb_build_object('refund_request_id',p_request_id),
      timeout_milliseconds:=10000
    );
  end if;
  return jsonb_build_object('id',p_request_id,'status','accepted');
end;$$;

commit;
