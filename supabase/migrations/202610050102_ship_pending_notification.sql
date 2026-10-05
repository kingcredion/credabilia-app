begin;

-- "Ship it" alert. A paid shipped order that has no label yet now shows in the seller's bell (and the app makes the Sell tab and its
-- Sold tab glow) until the label is bought. Orders that were only ever used for testing are marked so they never nag.
alter table public.purchases add column test_order boolean not null default false;
update public.purchases p set test_order=true from public.listings l where l.id=p.listing_id and l.title like 'TEST ONLY%';

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

    -- Seller: a paid shipped order is waiting for a label. Stays until the label is bought, so the bell keeps glowing.
    select 'ship_pending', 'seller', p.id, l.id, l.title,
      'Ship "'||l.title||'" — your buyer is waiting', p.created_at, null::uuid
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='ship' and p.escrow_status='held' and p.shipped_at is null and not p.test_order
  ) x;
$$;

commit;
