begin;

-- The auction-closing function was rewritten several times (proxy bidding, auction hardening, locked listings) and the Klaviyo "Auction Won"
-- event added in 202609300038 got lost along the way, so winners got the push and text but never the email. It is sent again here, both to the
-- winner and to the next bidder when the first winner does not pay (they are offered the item at their own bid, which is a win for them).
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
      perform public.notify_klaviyo_user(st.high_bidder_id,'Auction Won',jsonb_build_object('listing_id',item.id,'title',item.title,'winning_bid_cents',item.price_cents));
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
      perform public.notify_klaviyo_user(nxt.bidder_id,'Auction Won',jsonb_build_object('listing_id',item.id,'title',item.title,'winning_bid_cents',nxt.offer_cents));
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
