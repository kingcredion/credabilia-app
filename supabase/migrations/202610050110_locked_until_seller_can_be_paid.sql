begin;

-- A listing from a seller who has not finished Stripe payout setup stays VISIBLE (so the marketplace looks full) but is LOCKED: nobody can buy it,
-- ask to buy it, or bid on it until the seller can be paid. It unlocks by itself the moment Stripe confirms the seller's account.
--
-- Auctions need extra care: a winner who cannot pay because the seller was not ready must never be struck, so a locked auction cannot take bids,
-- its clock does not run out while it is locked, and the full auction length starts over when it unlocks.

alter table public.listings add column auction_days smallint;
update public.listings set auction_days=greatest(1,round(extract(epoch from (auction_ends_at-created_at))/86400))::smallint
  where listing_type='auction' and auction_ends_at is not null;

-- remember the chosen auction length (create_listing_with_details sets the type and end time right after the insert)
create function public.capture_auction_days() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.listing_type='auction' and new.auction_days is null and new.auction_ends_at is not null then
    new.auction_days:=greatest(1,round(extract(epoch from (new.auction_ends_at-now()))/86400))::smallint;
  end if;
  return new;
end;$$;
create trigger capture_auction_days before insert or update on public.listings for each row execute function public.capture_auction_days();

create function public.seller_can_be_paid(p_seller uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.stripe_accounts where user_id=p_seller and charges_enabled);
$$;
revoke all on function public.seller_can_be_paid(uuid) from public,anon,authenticated;

-- "ask to buy" on a fixed-price item (request_to_buy) is blocked here without touching that function; auction winners are inserted by settlement
-- (auction_award) and are never blocked by this.
create function public.block_requests_to_unpaid_sellers() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(new.auction_award,false) and new.status='pending' and not public.seller_can_be_paid(new.seller_id) then
    raise exception 'This item is locked until the seller finishes payment setup, so it cannot be bought yet.';
  end if;
  return new;
end;$$;
create trigger block_requests_to_unpaid_sellers before insert on public.availability_requests for each row execute function public.block_requests_to_unpaid_sellers();

-- bidding: same as before, plus the lock
create or replace function public.place_bid(p_listing_id uuid, p_amount_cents bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; st public.auction_state; reason text; inc bigint; new_price bigint; old_high uuid;
  lead_changed boolean:=false; outbid_now boolean:=false; extended boolean:=false; ends timestamptz; fmt text:='FM999,999,990.00';
begin
  if actor is null then raise exception 'Sign in to bid' using errcode='42501'; end if;
  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' or item.listing_type<>'auction' then raise exception 'This auction is not available for bidding.'; end if;
  if item.auction_ends_at<=now() then raise exception 'This auction has ended.'; end if;
  if item.seller_id=actor then raise exception 'You cannot bid on your own listing.'; end if;
  if not public.seller_can_be_paid(item.seller_id) then raise exception 'This auction is locked until the seller finishes payment setup, so it cannot take bids yet.'; end if;
  reason:=public.bidder_block_reason(actor);
  if reason is not null then raise exception '%',reason; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'Enter a valid bid.'; end if;

  perform set_config('app.auction_internal','1',true);
  select * into st from public.auction_state where listing_id=p_listing_id for update;
  new_price:=item.price_cents;

  if not found then
    if p_amount_cents<item.price_cents then raise exception 'Your bid must be at least the starting bid of $%.',to_char(item.price_cents/100.0,fmt); end if;
    insert into public.auction_state(listing_id,high_bidder_id,high_max_cents) values(p_listing_id,actor,p_amount_cents);
    insert into public.bids(listing_id,bidder_id,amount_cents,max_cents) values(p_listing_id,actor,item.price_cents,p_amount_cents);
    update public.listings set bid_count=bid_count+1 where id=p_listing_id;
  elsif st.high_bidder_id=actor then
    if p_amount_cents<=st.high_max_cents then raise exception 'Your new maximum must be higher than your current maximum of $%.',to_char(st.high_max_cents/100.0,fmt); end if;
    update public.auction_state set high_max_cents=p_amount_cents where listing_id=p_listing_id;
  else
    inc:=public.auction_increment(item.price_cents);
    if p_amount_cents<item.price_cents+inc then raise exception 'Enter at least $%.',to_char((item.price_cents+inc)/100.0,fmt); end if;
    old_high:=st.high_bidder_id;
    if p_amount_cents>st.high_max_cents then
      new_price:=least(p_amount_cents,st.high_max_cents+public.auction_increment(st.high_max_cents));
      if st.high_max_cents>item.price_cents then
        insert into public.bids(listing_id,bidder_id,amount_cents,max_cents,is_auto) values(p_listing_id,old_high,st.high_max_cents,st.high_max_cents,true);
      end if;
      insert into public.bids(listing_id,bidder_id,amount_cents,max_cents) values(p_listing_id,actor,new_price,p_amount_cents);
      update public.auction_state set high_bidder_id=actor,high_max_cents=p_amount_cents where listing_id=p_listing_id;
      lead_changed:=true;
    else
      new_price:=least(st.high_max_cents,p_amount_cents+public.auction_increment(p_amount_cents));
      insert into public.bids(listing_id,bidder_id,amount_cents,max_cents) values(p_listing_id,actor,p_amount_cents,p_amount_cents);
      insert into public.bids(listing_id,bidder_id,amount_cents,max_cents,is_auto) values(p_listing_id,old_high,new_price,st.high_max_cents,true);
      outbid_now:=true;
    end if;
    update public.listings set price_cents=new_price,bid_count=bid_count+1 where id=p_listing_id;
  end if;

  ends:=item.auction_ends_at;
  if ends-now()<=interval '5 minutes' then
    ends:=now()+interval '5 minutes'; extended:=true;
    update public.listings set auction_ends_at=ends where id=p_listing_id;
  end if;

  if lead_changed then
    perform public.notify_push(old_high,'You''ve been outbid on "'||item.title||'"','The current bid is now $'||to_char(new_price/100.0,fmt)||'.','/?item='||p_listing_id);
    perform public.notify_sms(old_high,'Credabilia: You''ve been outbid on "'||item.title||'". Current bid: $'||to_char(new_price/100.0,fmt)||'. Bid again: https://credabilia.com/item/'||p_listing_id||'. Reply STOP to opt out.');
    perform public.notify_klaviyo_user(old_high,'Outbid',jsonb_build_object('listing_id',p_listing_id,'title',item.title,'amount_cents',new_price));
  end if;

  return jsonb_build_object('amount_cents',new_price,'bid_count',(select bid_count from public.listings where id=p_listing_id),
    'is_high_bidder',not outbid_now,'my_max_cents',p_amount_cents,'outbid_by_existing_maximum',outbid_now,'extended',extended,'auction_ends_at',ends);
end;$$;

-- settlement: an auction that ended with no bids is closed and the seller is told; a LOCKED one is not closed, its clock simply starts over.
-- A winner is never struck when the seller was the one who could not be paid.
create or replace function public.settle_ended_auctions() returns integer
language plpgsql security definer set search_path='' as $$
declare item record; st public.auction_state; settled integer:=0; lapsed public.availability_requests; nxt record; fmt text:='FM999,999,990.00';
begin
  perform set_config('app.auction_internal','1',true);

  for item in select * from public.listings where listing_type='auction' and status='active' and auction_ends_at<=now()
      and not exists(select 1 from public.availability_requests r where r.listing_id=listings.id and r.auction_award) for update skip locked loop
    select * into st from public.auction_state where listing_id=item.id;
    if found then
      insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at,responded_at,auction_award)
        values(item.id,st.high_bidder_id,item.seller_id,'confirmed',now()+interval '48 hours',now(),true);
      update public.listings set status='pending' where id=item.id;
      perform public.notify_push(st.high_bidder_id,'You won "'||item.title||'"!','Pay within 48 hours or the item goes to the next bidder.','/?item='||item.id);
      perform public.notify_sms(st.high_bidder_id,'Credabilia: You won "'||item.title||'" for $'||to_char(item.price_cents/100.0,fmt)||'. Pay within 48 hours: https://credabilia.com/item/'||item.id||'. Reply STOP to opt out.');
      perform public.notify_push(item.seller_id,'"'||item.title||'" auction ended','The auction sold. The winning bidder has 48 hours to pay.','/?item='||item.id);
    elsif public.seller_can_be_paid(item.seller_id) then
      update public.listings set status='archived' where id=item.id;
      perform public.notify_push(item.seller_id,'"'||item.title||'" ended with no bids','You can relist it as an auction or at a fixed price from your Sell tab.','/');
      perform public.notify_klaviyo_user(item.seller_id,'Auction Ended No Bids',jsonb_build_object('listing_id',item.id,'title',item.title));
    else
      update public.listings set auction_ends_at=now()+make_interval(days=>coalesce(item.auction_days,5)) where id=item.id;
    end if;
    settled:=settled+1;
  end loop;

  for item in select l.* from public.listings l where l.listing_type='auction' and l.status in ('pending','active') and l.auction_ends_at<=now()
      and exists(select 1 from public.availability_requests r where r.listing_id=l.id and r.auction_award)
      and not exists(select 1 from public.checkout_sessions c where c.listing_id=l.id and c.status in ('pending','completed') and (c.status='completed' or c.expires_at>now()))
      for update skip locked loop
    select * into lapsed from public.availability_requests where listing_id=item.id and auction_award order by created_at desc limit 1;
    continue when lapsed.status not in ('confirmed','expired') or (lapsed.status='confirmed' and lapsed.expires_at>=now());
    if not public.seller_can_be_paid(item.seller_id) then
      -- the seller could not take the payment: give the winner more time and no strike
      update public.availability_requests set status='confirmed',expires_at=now()+interval '48 hours' where id=lapsed.id;
      continue;
    end if;
    update public.availability_requests set status='expired' where id=lapsed.id;
    insert into public.bid_strikes(user_id,listing_id) values(lapsed.buyer_id,item.id) on conflict do nothing;
    perform public.notify_push(lapsed.buyer_id,'You did not pay for "'||item.title||'"','The item was offered to the next bidder, and a strike was added to your account. Two strikes pause bidding.','/');
    perform public.notify_operator_alert('Admin Alert: Payment Problem',jsonb_build_object('summary','An auction winner did not pay within 48 hours.','reference',item.id::text,'detail','Winner '||lapsed.buyer_id::text||' got a strike; the item goes to the next bidder.'));

    select b.bidder_id,max(b.amount_cents) as offer_cents into nxt
      from public.bids b
      where b.listing_id=item.id and b.bidder_id<>all(array(select r.buyer_id from public.availability_requests r where r.listing_id=item.id and r.auction_award))
        and public.bidder_block_reason(b.bidder_id) is null
      group by b.bidder_id order by max(b.amount_cents) desc limit 1;
    if found then
      update public.listings set price_cents=nxt.offer_cents,status='pending' where id=item.id;
      insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at,responded_at,auction_award)
        values(item.id,nxt.bidder_id,item.seller_id,'confirmed',now()+interval '48 hours',now(),true);
      perform public.notify_push(nxt.bidder_id,'"'||item.title||'" is available to you','The winner did not pay. You can buy it at your bid of $'||to_char(nxt.offer_cents/100.0,fmt)||' within 48 hours.','/?item='||item.id);
      perform public.notify_sms(nxt.bidder_id,'Credabilia: "'||item.title||'" is available to you at $'||to_char(nxt.offer_cents/100.0,fmt)||' because the winner did not pay. Buy within 48 hours: https://credabilia.com/item/'||item.id||'. Reply STOP to opt out.');
      perform public.notify_push(item.seller_id,'"'||item.title||'": the winner did not pay','It was offered to the next-highest bidder at their bid.','/?item='||item.id);
    else
      update public.listings set status='archived' where id=item.id;
      perform public.notify_push(item.seller_id,'"'||item.title||'": the winner did not pay','There are no other bidders, so the auction has closed. You can relist the item.','/');
    end if;
    settled:=settled+1;
  end loop;
  return settled;
end;$$;

-- the moment Stripe confirms a seller's account: locked auctions start their full length, and the seller is told
create function public.unlock_seller_listings() returns trigger
language plpgsql security definer set search_path='' as $$
declare locked_count integer;
begin
  if new.charges_enabled and not coalesce(old.charges_enabled,false) then
    perform set_config('app.auction_internal','1',true);
    update public.listings set auction_ends_at=now()+make_interval(days=>coalesce(auction_days,5))
      where seller_id=new.user_id and listing_type='auction' and status='active' and bid_count=0;
    select count(*) into locked_count from public.listings where seller_id=new.user_id and status='active';
    if locked_count>0 then
      perform public.notify_push(new.user_id,'Your listings are unlocked','Payout setup is complete. Buyers can now buy and bid on your '||locked_count||' listing'||case when locked_count=1 then '' else 's' end||'.','/');
      perform public.notify_klaviyo_user(new.user_id,'Listings Unlocked',jsonb_build_object('count',locked_count));
    end if;
  end if;
  return new;
end;$$;
create trigger unlock_seller_listings after update on public.stripe_accounts for each row execute function public.unlock_seller_listings();

commit;
