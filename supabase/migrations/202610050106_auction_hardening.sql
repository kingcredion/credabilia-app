begin;

-- Auction hardening, from the pre-launch audit of 2026-10-05:
--  1. A seller can no longer change the price/timing of an auction that has bids (or has ended), or delete one with bids.
--  2. A winner who does not pay is struck, and the item is offered to the next-highest bidder (or the seller can relist it).
--  3. Bidding needs a card on file (a card the member has paid with, or one saved through Stripe) and no recent unpaid wins.
--  4. Soft close: a bid in the last 5 minutes pushes the end out 5 minutes.
--  5. eBay-style bid steps that grow with the price, and proxy ("maximum") bidding.

-- ---------------------------------------------------------------------------------------------------------------------------
-- Private bidding state. price_cents on the listing stays the public current price; the leader's maximum is never exposed.
create table public.auction_state (
  listing_id uuid primary key references public.listings(id),
  high_bidder_id uuid not null references public.profiles(id),
  high_max_cents bigint not null check (high_max_cents>0)
);
alter table public.auction_state enable row level security;
revoke all on public.auction_state from public,anon,authenticated;

alter table public.bids
  add column max_cents bigint,
  add column is_auto boolean not null default false;

create table public.bid_strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  listing_id uuid not null references public.listings(id),
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);
alter table public.bid_strikes enable row level security;
revoke all on public.bid_strikes from public,anon,authenticated;

alter table public.availability_requests add column auction_award boolean not null default false;

-- Backfill any auction that is already running with bids (the leader's maximum is their highest bid so far).
insert into public.auction_state(listing_id,high_bidder_id,high_max_cents)
select distinct on (b.listing_id) b.listing_id,b.bidder_id,b.amount_cents
from public.bids b join public.listings l on l.id=b.listing_id
where l.listing_type='auction' and l.status in ('active','pending')
order by b.listing_id,b.amount_cents desc,b.created_at asc
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------------
-- eBay's bid-increment table, in cents.
create function public.auction_increment(p_price_cents bigint) returns bigint
language sql immutable set search_path='' as $$
  select case
    when p_price_cents<100 then 5
    when p_price_cents<500 then 25
    when p_price_cents<2500 then 50
    when p_price_cents<10000 then 100
    when p_price_cents<25000 then 250
    when p_price_cents<50000 then 500
    when p_price_cents<100000 then 1000
    when p_price_cents<250000 then 2500
    when p_price_cents<500000 then 5000
    else 10000 end;
$$;
revoke all on function public.auction_increment(bigint) from public;
grant execute on function public.auction_increment(bigint) to anon,authenticated,service_role;

-- null = free to bid, otherwise the reason (shown to the member).
create function public.bidder_block_reason(p_user_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from public.profiles where id=p_user_id and (banned_at is not null or deleted_at is not null)) then
    return 'This account cannot place bids.';
  end if;
  if (select count(*) from public.bid_strikes where user_id=p_user_id and created_at>now()-interval '90 days')>=2 then
    return 'Bidding is paused on your account because of unpaid auction wins. Please contact support.';
  end if;
  if not exists(select 1 from public.payment_fingerprints f where f.user_id=p_user_id and f.kind='card'
      and not exists(select 1 from public.blocked_fingerprints b where b.kind='card' and b.fingerprint=f.fingerprint and b.banned_user_id is distinct from p_user_id)) then
    return 'Add a card to bid. It is not charged now. It just confirms you are a real bidder, because every bid is a binding commitment to buy.';
  end if;
  return null;
end;$$;
revoke all on function public.bidder_block_reason(uuid) from public,anon,authenticated;

-- Called by the stripe-webhook once a member has saved a card through Stripe. Same blocked-card check as a paid order.
create function public.record_bid_card(p_user_id uuid, p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Member not found.'; end if;
  return public.record_payment_fingerprint(p_user_id,'card',p_fingerprint);
end;$$;
revoke all on function public.record_bid_card(uuid,text) from public,anon,authenticated;
grant execute on function public.record_bid_card(uuid,text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Placing a bid. p_amount_cents is the bidder's MAXIMUM: the system bids for them, only as high as needed, up to that amount.
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
  reason:=public.bidder_block_reason(actor);
  if reason is not null then raise exception '%',reason; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'Enter a valid bid.'; end if;

  perform set_config('app.auction_internal','1',true);
  select * into st from public.auction_state where listing_id=p_listing_id for update;
  new_price:=item.price_cents;

  if not found then
    -- first bid: it only has to reach the starting bid; the price stays at the starting bid until someone competes
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
      -- the new bidder takes the lead; the previous leader's automatic bids climbed to their maximum first
      new_price:=least(p_amount_cents,st.high_max_cents+public.auction_increment(st.high_max_cents));
      if st.high_max_cents>item.price_cents then
        insert into public.bids(listing_id,bidder_id,amount_cents,max_cents,is_auto) values(p_listing_id,old_high,st.high_max_cents,st.high_max_cents,true);
      end if;
      insert into public.bids(listing_id,bidder_id,amount_cents,max_cents) values(p_listing_id,actor,new_price,p_amount_cents);
      update public.auction_state set high_bidder_id=actor,high_max_cents=p_amount_cents where listing_id=p_listing_id;
      lead_changed:=true;
    else
      -- the previous leader keeps the lead (an equal maximum goes to whoever bid first); the new bid is outbid straight away
      new_price:=least(st.high_max_cents,p_amount_cents+public.auction_increment(p_amount_cents));
      insert into public.bids(listing_id,bidder_id,amount_cents,max_cents) values(p_listing_id,actor,p_amount_cents,p_amount_cents);
      insert into public.bids(listing_id,bidder_id,amount_cents,max_cents,is_auto) values(p_listing_id,old_high,new_price,st.high_max_cents,true);
      outbid_now:=true;
    end if;
    update public.listings set price_cents=new_price,bid_count=bid_count+1 where id=p_listing_id;
  end if;

  -- soft close: a bid in the last 5 minutes keeps the auction open for 5 more
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

-- What the bid box needs to know about the signed-in member and this auction.
create function public.my_bid_status(p_listing_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); st public.auction_state; reason text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  reason:=public.bidder_block_reason(actor);
  select * into st from public.auction_state where listing_id=p_listing_id;
  return jsonb_build_object('can_bid',reason is null,'reason',reason,
    'is_high_bidder',found and st.high_bidder_id=actor,
    'my_max_cents',case when found and st.high_bidder_id=actor then st.high_max_cents else
      (select max(max_cents) from public.bids where listing_id=p_listing_id and bidder_id=actor and not is_auto) end);
end;$$;
revoke all on function public.my_bid_status(uuid) from public,anon;
grant execute on function public.my_bid_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- A seller cannot move the goalposts once bidding has started (or after it has ended). place_bid / settlement set the flag.
create function public.lock_auction_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.listing_type='auction' and coalesce(current_setting('app.auction_internal',true),'')<>'1' and not public.is_operator() then
    if new.listing_type is distinct from old.listing_type or new.auction_ends_at is distinct from old.auction_ends_at or new.bid_count is distinct from old.bid_count then
      raise exception 'An auction''s type and end time cannot be changed.';
    end if;
    if new.price_cents is distinct from old.price_cents and (old.bid_count>0 or old.auction_ends_at<=now()) then
      raise exception 'This auction already has bids (or has ended), so its price cannot be changed.';
    end if;
  end if;
  return new;
end;$$;
create trigger lock_auction_fields before update on public.listings for each row execute function public.lock_auction_fields();

create or replace function public.delete_listing(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item public.listings; permitted boolean; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select can_sell into permitted from public.account_permissions where user_id=actor for share;
  if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
  select * into item from public.listings where id=p_id for update;
  if not found or item.seller_id<>actor then raise exception 'You can only delete your own listing' using errcode='42501'; end if;
  if item.status<>'active' then raise exception 'Only active listings can be deleted'; end if;
  if item.listing_type='auction' and (item.bid_count>0 or item.auction_ends_at<=now()) then
    raise exception 'This auction has bids, so it cannot be removed. Contact support if there is a problem with the item.';
  end if;
  update public.listings set status='archived' where id=p_id;
end;$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Settlement (hourly -> every 5 minutes, see the schedule migration). Service role only.
--   1. Auctions that just ended: the leader gets a 48 hour offer at the final price, or the item is archived if nobody bid.
--   2. An offer that lapsed unpaid: the winner gets a strike, the next-highest bidder is offered the item at their own highest
--      bid, and if nobody is left the item is archived so the seller can relist it.
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
    else
      update public.listings set status='archived' where id=item.id;
    end if;
    settled:=settled+1;
  end loop;

  for item in select l.* from public.listings l where l.listing_type='auction' and l.status in ('pending','active') and l.auction_ends_at<=now()
      and exists(select 1 from public.availability_requests r where r.listing_id=l.id and r.auction_award)
      and not exists(select 1 from public.checkout_sessions c where c.listing_id=l.id and c.status in ('pending','completed') and (c.status='completed' or c.expires_at>now()))
      for update skip locked loop
    select * into lapsed from public.availability_requests where listing_id=item.id and auction_award order by created_at desc limit 1;
    continue when lapsed.status not in ('confirmed','expired') or (lapsed.status='confirmed' and lapsed.expires_at>=now());
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

commit;
