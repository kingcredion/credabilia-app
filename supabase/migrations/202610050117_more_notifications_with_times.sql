begin;

-- Every bell item now carries when it started ('at') and, where there is a deadline, when it runs out ('expires_at'). The app uses those to decide
-- when an item that has already been seen should pulse again (a newer message, or a deadline getting close).
-- New items the bell was missing: outbid on a live auction, an ended auction waiting to be relisted, a seller who has listings but has not
-- finished payout setup, and (operator only) disputes and reports waiting for a decision.
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',x.kind,'role',x.role,'purchase_id',x.purchase_id,'listing_id',x.listing_id,'title',x.title,'message',x.message,'conversation_id',x.conversation_id,
    'at',x.at,'expires_at',x.expires_at
  ) order by x.at desc),'[]'::jsonb) from (
    select 'refund_pending' as kind, 'seller' as role, p.id as purchase_id, l.id as listing_id, l.title,
      'Refund requested for "'||l.title||'"' as message, r.created_at as at, null::uuid as conversation_id, null::timestamptz as expires_at
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.seller_id=auth.uid() and r.status='pending'

    union all

    select 'partial_offered', 'buyer', p.id, l.id, l.title,
      'Partial refund offered for "'||l.title||'"', r.created_at, null::uuid, null::timestamptz
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='partial_offered'

    union all

    select 'return_required', 'buyer', p.id, l.id, l.title,
      'Ship "'||l.title||'" back to get your refund', r.created_at, null::uuid, null::timestamptz
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='return_required' and r.return_shipped_at is null

    union all

    select 'message', 'seller', null::uuid, l.id, l.title,
      'New message about "'||l.title||'"', last_from_buyer.at, c.id, null::timestamptz
    from public.conversations c join public.listings l on l.id=c.listing_id
    join lateral (select max(created_at) as at from public.messages where conversation_id=c.id and sender_id=c.buyer_id) last_from_buyer on true
    where c.seller_id=auth.uid() and last_from_buyer.at is not null and last_from_buyer.at>coalesce(c.seller_last_read_at,'-infinity'::timestamptz)

    union all

    select 'message', 'buyer', null::uuid, l.id, l.title,
      'New message about "'||l.title||'"', last_from_seller.at, c.id, null::timestamptz
    from public.conversations c join public.listings l on l.id=c.listing_id
    join lateral (select max(created_at) as at from public.messages where conversation_id=c.id and sender_id=c.seller_id) last_from_seller on true
    where c.buyer_id=auth.uid() and last_from_seller.at is not null and last_from_seller.at>coalesce(c.buyer_last_read_at,'-infinity'::timestamptz)

    union all

    select 'buy_request_pending', 'seller', null::uuid, l.id, l.title,
      'Confirm "'||l.title||'" is still available', r.created_at, null::uuid, r.expires_at
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.seller_id=auth.uid() and r.status='pending' and r.expires_at>now()

    union all

    select 'buy_request_confirmed', 'buyer', null::uuid, l.id, l.title,
      '"'||l.title||'" is confirmed available — complete your purchase', r.responded_at, null::uuid, r.expires_at
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.buyer_id=auth.uid() and r.status='confirmed' and r.expires_at>now()

    union all

    select 'pickup_awaiting_handoff', 'seller', p.id, l.id, l.title,
      'Enter the buyer''s handoff code for "'||l.title||'" once you''ve handed it over', p.created_at, null::uuid, null::timestamptz
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null

    union all

    select 'ship_pending', 'seller', p.id, l.id, l.title,
      'Ship "'||l.title||'" — your buyer is waiting', p.created_at, null::uuid, null::timestamptz
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='ship' and p.escrow_status='held' and p.shipped_at is null and not p.test_order

    union all

    select 'pickup_inspect', 'buyer', p.id, l.id, l.title,
      'Meet the seller to inspect "'||l.title||'", then accept it to get your handoff code', p.created_at, p.conversation_id, null::timestamptz
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null
      and p.inspection_accepted_at is null and p.inspection_issue_at is null

    union all

    select 'pickup_code_ready', 'buyer', p.id, l.id, l.title,
      'Your handoff code for "'||l.title||'" is ready. Read it to the seller when you meet', p.inspection_accepted_at, p.conversation_id, null::timestamptz
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null
      and p.inspection_accepted_at is not null

    union all

    select 'inspect_delivered', 'buyer', p.id, l.id, l.title,
      'Your "'||l.title||'" arrived. Check it, then accept it or report a problem', p.delivered_at, p.conversation_id, null::timestamptz
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='ship' and p.escrow_status='held' and p.delivered_at is not null
      and p.inspection_accepted_at is null and p.inspection_issue_at is null and not p.test_order

    union all

    -- Buyer: someone is now ahead of your bid on an auction that is still running. The auction's end is the deadline.
    select 'outbid', 'buyer', null::uuid, l.id, l.title,
      'You''ve been outbid on "'||l.title||'". Bid again before it ends', last_bid.at, null::uuid, l.auction_ends_at
    from public.listings l
    join public.auction_state s on s.listing_id=l.id
    join lateral (select max(created_at) as at from public.bids where listing_id=l.id) last_bid on true
    where l.listing_type='auction' and l.status='active' and l.auction_ends_at>now() and s.high_bidder_id<>auth.uid()
      and exists(select 1 from public.bids b where b.listing_id=l.id and b.bidder_id=auth.uid())

    union all

    -- Seller: an auction ended with no bids or was not paid for, and is waiting on the Ended tab to be relisted.
    select 'auction_relist', 'seller', null::uuid, l.id, l.title,
      case when l.archived_reason='auction_no_bids' then '"'||l.title||'" ended with no bids. Relist it'
           else '"'||l.title||'" was not paid for. Relist it' end, l.auction_ends_at, null::uuid, null::timestamptz
    from public.listings l
    where l.seller_id=auth.uid() and l.status='archived' and l.archived_reason in ('auction_no_bids','auction_unpaid')
      and l.auction_ends_at>now()-interval '30 days'

    union all

    -- Seller: listings are published but locked until payout setup is finished.
    select 'payout_setup', 'seller', null::uuid, null::uuid, null::text,
      'Finish payout setup so buyers can buy your listings', max(l.created_at), null::uuid, null::timestamptz
    from public.listings l
    where l.seller_id=auth.uid() and l.status in ('active','pending') and not public.seller_can_be_paid(auth.uid())
    having count(*)>0

    union all

    -- Operator only: disputes and reports waiting for a decision.
    select 'admin_disputes', 'operator', null::uuid, null::uuid, null::text,
      count(*)||' dispute'||case when count(*)=1 then '' else 's' end||' waiting for your decision', max(r.created_at), null::uuid, null::timestamptz
    from public.refund_requests r
    where public.is_operator() and r.status='contested'
    having count(*)>0

    union all

    select 'admin_reports', 'operator', null::uuid, null::uuid, null::text,
      count(*)||' report'||case when count(*)=1 then '' else 's' end||' waiting for review', max(rp.created_at), null::uuid, null::timestamptz
    from public.reports rp
    where public.is_operator() and rp.status='open'
    having count(*)>0
  ) x;
$$;
revoke all on function public.my_notifications() from public,anon;
grant execute on function public.my_notifications() to authenticated;

commit;
