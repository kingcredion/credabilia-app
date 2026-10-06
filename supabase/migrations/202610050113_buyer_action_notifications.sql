begin;

-- The bell told sellers what to do (ship, hand over a pickup, answer a request) but told buyers nothing at the two moments they have to act:
-- inspecting and accepting a local-pickup item (which is what releases their handoff code), and checking a package that has arrived.
-- Three buyer items are added; each carries the order's conversation so the bell, the Messages tab and the email all land on the same place.
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',x.kind,'role',x.role,'purchase_id',x.purchase_id,'listing_id',x.listing_id,'title',x.title,'message',x.message,'conversation_id',x.conversation_id
  ) order by x.at desc),'[]'::jsonb) from (
    select 'refund_pending' as kind, 'seller' as role, p.id as purchase_id, l.id as listing_id, l.title,
      'Refund requested for "'||l.title||'"' as message, r.created_at as at, null::uuid as conversation_id
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.seller_id=auth.uid() and r.status='pending'

    union all

    select 'partial_offered', 'buyer', p.id, l.id, l.title,
      'Partial refund offered for "'||l.title||'"', r.created_at, null::uuid
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='partial_offered'

    union all

    select 'return_required', 'buyer', p.id, l.id, l.title,
      'Ship "'||l.title||'" back to get your refund', r.created_at, null::uuid
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='return_required' and r.return_shipped_at is null

    union all

    select 'message', 'seller', null::uuid, l.id, l.title,
      'New message about "'||l.title||'"', last_from_buyer.at, c.id
    from public.conversations c join public.listings l on l.id=c.listing_id
    join lateral (select max(created_at) as at from public.messages where conversation_id=c.id and sender_id=c.buyer_id) last_from_buyer on true
    where c.seller_id=auth.uid() and last_from_buyer.at is not null and last_from_buyer.at>coalesce(c.seller_last_read_at,'-infinity'::timestamptz)

    union all

    select 'message', 'buyer', null::uuid, l.id, l.title,
      'New message about "'||l.title||'"', last_from_seller.at, c.id
    from public.conversations c join public.listings l on l.id=c.listing_id
    join lateral (select max(created_at) as at from public.messages where conversation_id=c.id and sender_id=c.seller_id) last_from_seller on true
    where c.buyer_id=auth.uid() and last_from_seller.at is not null and last_from_seller.at>coalesce(c.buyer_last_read_at,'-infinity'::timestamptz)

    union all

    select 'buy_request_pending', 'seller', null::uuid, l.id, l.title,
      'Confirm "'||l.title||'" is still available', r.created_at, null::uuid
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.seller_id=auth.uid() and r.status='pending' and r.expires_at>now()

    union all

    select 'buy_request_confirmed', 'buyer', null::uuid, l.id, l.title,
      '"'||l.title||'" is confirmed available — complete your purchase', r.responded_at, null::uuid
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.buyer_id=auth.uid() and r.status='confirmed' and r.expires_at>now()

    union all

    select 'pickup_awaiting_handoff', 'seller', p.id, l.id, l.title,
      'Enter the buyer''s handoff code for "'||l.title||'" once you''ve handed it over', p.created_at, null::uuid
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null

    union all

    select 'ship_pending', 'seller', p.id, l.id, l.title,
      'Ship "'||l.title||'" — your buyer is waiting', p.created_at, null::uuid
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='ship' and p.escrow_status='held' and p.shipped_at is null and not p.test_order

    union all

    -- Buyer, pickup: meet the seller, inspect the item, accept it. Accepting is what produces the handoff code.
    select 'pickup_inspect', 'buyer', p.id, l.id, l.title,
      'Meet the seller to inspect "'||l.title||'", then accept it to get your handoff code', p.created_at, p.conversation_id
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null
      and p.inspection_accepted_at is null and p.inspection_issue_at is null

    union all

    -- Buyer, pickup, accepted: the code is waiting and the seller needs it to finish the handoff.
    select 'pickup_code_ready', 'buyer', p.id, l.id, l.title,
      'Your handoff code for "'||l.title||'" is ready. Read it to the seller when you meet', p.inspection_accepted_at, p.conversation_id
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null
      and p.inspection_accepted_at is not null

    union all

    -- Buyer, shipped: the package arrived. Checking it and accepting it (or reporting a problem) starts the seller's payout.
    select 'inspect_delivered', 'buyer', p.id, l.id, l.title,
      'Your "'||l.title||'" arrived. Check it, then accept it or report a problem', p.delivered_at, p.conversation_id
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='ship' and p.escrow_status='held' and p.delivered_at is not null
      and p.inspection_accepted_at is null and p.inspection_issue_at is null and not p.test_order
  ) x;
$$;
revoke all on function public.my_notifications() from public,anon;
grant execute on function public.my_notifications() to authenticated;

commit;
