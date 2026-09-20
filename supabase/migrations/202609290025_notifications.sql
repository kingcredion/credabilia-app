begin;

-- Notifications aren't stored -- a notification is just "this purchase is currently in a state
-- that needs your action," computed live from refund_requests/messages. It self-clears the moment
-- you act, since nothing was ever written down in the first place. The one missing ingredient is
-- knowing whether a message is unread -- message_count (used throughout my_sales/my_purchases) is
-- a lifetime total, not an unread count, and messages has no read-state at all today.

alter table public.purchases
  add column buyer_last_read_at timestamptz,
  add column seller_last_read_at timestamptz;

-- Separate from get_messages (which stays stable/side-effect-free) so opening a thread is what
-- marks it read, not merely fetching it. MessageThread.jsx calls this alongside get_messages
-- whenever the thread is expanded.
create function public.mark_messages_read(p_purchase_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.purchases where id=p_purchase_id and (buyer_id=actor or seller_id=actor)) then
    raise exception 'Purchase not found.';
  end if;
  update public.purchases set buyer_last_read_at=now() where id=p_purchase_id and buyer_id=actor;
  update public.purchases set seller_last_read_at=now() where id=p_purchase_id and seller_id=actor;
end;$$;
revoke all on function public.mark_messages_read(uuid) from public,anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- contested is deliberately excluded here -- it's only actionable by the platform operator via
-- the existing out-of-band SQL resolution flow, which already has its own "Open disputes"
-- dashboard tile (operator_open_dispute_count). There's no in-app screen for a bell click to
-- land on for that state.
create function public.my_notifications() returns jsonb
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
  ) x;
$$;
revoke all on function public.my_notifications() from public,anon;
grant execute on function public.my_notifications() to authenticated;

commit;
