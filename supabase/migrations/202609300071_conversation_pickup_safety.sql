-- Surface pickup info inside the message thread itself (not just the item page/checkout), so a
-- buyer and seller arranging a meetup see the recommended safe-exchange station and a safety
-- reminder right where they're actually chatting, instead of having to tab back to the listing.
create or replace function public.list_conversations() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'listing_id',l.id,'listing_title',l.title,'listing_status',l.status,'listing_price_cents',l.price_cents,
    'role',case when c.buyer_id=auth.uid() then 'buyer' else 'seller' end,
    'counterparty_name',case when c.buyer_id=auth.uid() then seller.display_name else buyer.display_name end,
    'last_message_at',lm.created_at,'last_message_body',lm.body,
    'unread',lm.created_at is not null and lm.sender_id<>auth.uid() and lm.created_at>coalesce(case when c.buyer_id=auth.uid() then c.buyer_last_read_at else c.seller_last_read_at end,'-infinity'::timestamptz),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',x.path,'kind',x.kind)) from (select path,kind from public.listing_media where listing_id=l.id and kind='item' order by position limit 1) x),'[]'::jsonb),
    'pickup_enabled',l.pickup_enabled,
    'pickup_station',case when l.pickup_enabled then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end
  ) order by coalesce(lm.created_at,c.created_at) desc),'[]'::jsonb)
  from public.conversations c
  join public.listings l on l.id=c.listing_id
  join public.profiles buyer on buyer.id=c.buyer_id
  join public.profiles seller on seller.id=c.seller_id
  left join public.pickup_stations ps on ps.id=l.pickup_station_id
  left join lateral (select body,created_at,sender_id from public.messages where conversation_id=c.id order by created_at desc limit 1) lm on true
  where (c.buyer_id=auth.uid() or c.seller_id=auth.uid())
    and coalesce(lm.created_at,c.created_at) > coalesce(case when c.buyer_id=auth.uid() then c.buyer_cleared_at else c.seller_cleared_at end,'-infinity'::timestamptz);
$$;
revoke all on function public.list_conversations() from public;
grant execute on function public.list_conversations() to authenticated;
