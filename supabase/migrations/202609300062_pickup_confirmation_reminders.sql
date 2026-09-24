begin;

-- Local pickup follow-up: both parties confirm, no blind timer release. The seller gets a
-- persistent (non-blocking) reminder to mark the handoff once it happens, surfaced through the
-- same notification feed as every other "needs action" item. The buyer's confirm step is
-- surfaced separately as a full-screen blocking card in the frontend (PickupConfirmationGate),
-- not through this notification feed -- but the underlying "is one pending" condition is the same.

-- my_notifications(): 0-arg, plain create or replace, adds two branches for pickup. Current live
-- body confirmed at 202609300033_buy_availability_confirmation.sql:165-219.
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',x.kind,'role',x.role,'purchase_id',x.purchase_id,'listing_id',x.listing_id,'title',x.title,'message',x.message
  ) order by x.at desc),'[]'::jsonb) from (
    select 'refund_pending' as kind, 'seller' as role, p.id as purchase_id, l.id as listing_id, l.title,
      'Refund requested for "'||l.title||'"' as message, r.created_at as at
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.seller_id=auth.uid() and r.status='pending'

    union all

    select 'partial_offered', 'buyer', p.id, l.id, l.title,
      'Partial refund offered for "'||l.title||'"', r.created_at
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='partial_offered'

    union all

    select 'return_required', 'buyer', p.id, l.id, l.title,
      'Ship "'||l.title||'" back to get your refund', r.created_at
    from public.refund_requests r join public.purchases p on p.id=r.purchase_id join public.listings l on l.id=p.listing_id
    where r.buyer_id=auth.uid() and r.status='return_required' and r.return_shipped_at is null

    union all

    select 'message', 'seller', p.id, l.id, l.title,
      'New message about "'||l.title||'"', last_from_buyer.at
    from public.purchases p join public.listings l on l.id=p.listing_id
    join lateral (select max(created_at) as at from public.messages where purchase_id=p.id and sender_id=p.buyer_id) last_from_buyer on true
    where p.seller_id=auth.uid() and last_from_buyer.at is not null and last_from_buyer.at>coalesce(p.seller_last_read_at,'-infinity'::timestamptz)

    union all

    select 'message', 'buyer', p.id, l.id, l.title,
      'New message about "'||l.title||'"', last_from_seller.at
    from public.purchases p join public.listings l on l.id=p.listing_id
    join lateral (select max(created_at) as at from public.messages where purchase_id=p.id and sender_id=p.seller_id) last_from_seller on true
    where p.buyer_id=auth.uid() and last_from_seller.at is not null and last_from_seller.at>coalesce(p.buyer_last_read_at,'-infinity'::timestamptz)

    union all

    select 'buy_request_pending', 'seller', null::uuid, l.id, l.title,
      'Confirm "'||l.title||'" is still available', r.created_at
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.seller_id=auth.uid() and r.status='pending' and r.expires_at>now()

    union all

    select 'buy_request_confirmed', 'buyer', null::uuid, l.id, l.title,
      '"'||l.title||'" is confirmed available — complete your purchase', r.responded_at
    from public.availability_requests r join public.listings l on l.id=r.listing_id
    where r.buyer_id=auth.uid() and r.status='confirmed' and r.expires_at>now()

    union all

    -- Seller: pickup checkout is done but they haven't marked the handoff yet. Non-blocking --
    -- this only surfaces through the normal notification feed, never locks the seller out of
    -- the rest of the app (there's no telling when the real-world meetup will actually happen).
    select 'pickup_awaiting_handoff', 'seller', p.id, l.id, l.title,
      'Mark "'||l.title||'" picked up once you''ve handed it off', p.created_at
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.seller_marked_picked_up_at is null

    union all

    -- Buyer: seller already marked it picked up, buyer hasn't confirmed. Same condition the
    -- frontend's blocking PickupConfirmationGate checks -- this entry is what feeds the bell,
    -- the gate is what actually stops them from ignoring it.
    select 'pickup_awaiting_confirmation', 'buyer', p.id, l.id, l.title,
      'Confirm you picked up "'||l.title||'"', p.seller_marked_picked_up_at
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held'
      and p.seller_marked_picked_up_at is not null and p.buyer_confirmed_pickup_at is null
  ) x;
$$;

commit;
