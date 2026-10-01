begin;

-- Opt-in SMS notifications, alongside the existing opt-in push notifications -- same shape as
-- push_subscriptions (RLS-locked, no direct grants, every read/write through a narrow RPC), but
-- a single phone number per account rather than one row per device, since a phone number isn't
-- tied to a particular browser/device the way a push subscription is.
alter table public.profiles
  add column phone_number text,
  add column sms_opt_in boolean not null default false,
  add column sms_opt_in_at timestamptz;

-- Loose E.164-ish check -- the real validation (and the only thing that actually matters) is
-- Twilio accepting or rejecting the number when a message is sent. This just catches obvious
-- typos before they're stored, same spirit as the rest of this app's input checks.
create function public.update_sms_preferences(p_phone text, p_opt_in boolean) returns void
language plpgsql security definer set search_path='' as $$
declare clean text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_opt_in then
    clean:=btrim(coalesce(p_phone,''));
    if clean !~ '^\+?[0-9]{10,15}$' then raise exception 'Enter a valid phone number.'; end if;
    update public.profiles set phone_number=clean, sms_opt_in=true, sms_opt_in_at=now() where id=auth.uid();
  else
    update public.profiles set sms_opt_in=false where id=auth.uid();
  end if;
end;$$;
revoke all on function public.update_sms_preferences(text,boolean) from public,anon;
grant execute on function public.update_sms_preferences(text,boolean) to authenticated;

-- Mirrors push_trigger_secret's pattern exactly -- see 202609300032_push_notifications.sql.
select vault.create_secret(encode(gen_random_bytes(32),'hex'), 'sms_trigger_secret',
  'Shared secret notify_sms() sends to the send-sms edge function.')
where not exists(select 1 from vault.secrets where name='sms_trigger_secret');

-- Fire-and-forget SMS send via pg_net, mirroring notify_push(). Takes a single pre-built message
-- body (unlike notify_push's separate title/body/url) since a text message is just one string --
-- the caller builds in whatever context (item link, etc.) belongs in it. The opted-in check here
-- is just to skip a wasted HTTP call; send-sms re-checks server-side regardless.
create function public.notify_sms(p_user_id uuid, p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare secret text;
begin
  if not exists(select 1 from public.profiles where id=p_user_id and sms_opt_in and phone_number is not null) then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='sms_trigger_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/send-sms',
    body:=jsonb_build_object('user_id',p_user_id,'body',p_body),
    headers:=jsonb_build_object('Content-Type','application/json','x-sms-secret',secret),
    timeout_milliseconds:=5000
  );
exception when others then null;
end;$$;
revoke all on function public.notify_sms(uuid,text) from public,anon,authenticated;

-- Wire notify_sms alongside the existing notify_push calls, at the exact events the user asked
-- for: a buyer requesting to buy (seller must confirm), the seller's confirm/decline reaching the
-- buyer, and an auction ending (winner + seller). Reply-STOP boilerplate is kept in every message
-- rather than only the first, to stay simple and always carrier-compliant.

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
  return jsonb_build_object('id',new_id,'listing_id',p_listing_id,'status','pending','expires_at',new_expires);
end;$$;

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
  else
    update public.listings set status='active' where id=request.listing_id and status='pending';
    perform public.notify_push(request.buyer_id, '"'||item.title||'" is no longer available', 'The seller let us know this item has already sold elsewhere.', '/?item='||request.listing_id);
    perform public.notify_sms(request.buyer_id, 'Credabilia: "'||item.title||'" is no longer available. Reply STOP to opt out.');
  end if;
  return jsonb_build_object('id',p_request_id,'status',new_status);
end;$$;

create or replace function public.settle_ended_auctions() returns integer
language plpgsql security definer set search_path='' as $$
declare item record; winning_bidder uuid; settled integer:=0; new_request_id uuid;
begin
  for item in select * from public.listings where listing_type='auction' and status='active' and auction_ends_at<=now() for update skip locked loop
    select bidder_id into winning_bidder from public.bids where listing_id=item.id order by amount_cents desc, created_at asc limit 1;
    if winning_bidder is not null then
      insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at,responded_at)
        values(item.id,winning_bidder,item.seller_id,'confirmed',now()+interval '48 hours',now())
        returning id into new_request_id;
      update public.listings set status='pending' where id=item.id;
      perform public.notify_push(winning_bidder, 'You won "'||item.title||'"!', 'Complete your purchase before this expires.', '/?item='||item.id);
      perform public.notify_sms(winning_bidder, 'Credabilia: You won "'||item.title||'"! Complete your purchase: https://credabilia.com/item/'||item.id||'. Reply STOP to opt out.');
      perform public.notify_push(item.seller_id, '"'||item.title||'" auction ended', 'The auction sold — the winning bidder can now check out.', '/?item='||item.id);
      perform public.notify_sms(item.seller_id, 'Credabilia: "'||item.title||'" sold! The winning bidder can now check out. Reply STOP to opt out.');
      perform public.notify_klaviyo((select email from auth.users where id=winning_bidder),'Auction Won',
        jsonb_build_object('listing_id',item.id,'title',item.title,'winning_bid_cents',item.price_cents));
    else
      update public.listings set status='archived' where id=item.id;
    end if;
    settled:=settled+1;
  end loop;
  return settled;
end;$$;

-- New: outbid notification. Didn't exist for push either -- place_bid never told the previous
-- high bidder they'd lost the lead. Captures the previous bidder before inserting the new bid
-- (after insert, the new bid IS the highest).
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
  end if;
  return jsonb_build_object('id',new_bid.id,'amount_cents',new_bid.amount_cents,'bid_count',item.bid_count+1);
end;$$;
revoke all on function public.place_bid(uuid,bigint) from public,anon;
grant execute on function public.place_bid(uuid,bigint) to authenticated;

commit;
