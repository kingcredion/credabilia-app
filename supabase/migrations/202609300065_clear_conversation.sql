begin;

-- Lets a buyer or seller clear a conversation out of their own inbox -- typically one whose
-- listing is no longer available and just sits there as clutter. Per-side, like
-- buyer_last_read_at/seller_last_read_at: clearing never deletes anything or affects the other
-- party, and a conversation reappears on its own the moment new activity arrives after the clear
-- (no separate "unclear" action needed).

alter table public.conversations add column buyer_cleared_at timestamptz;
alter table public.conversations add column seller_cleared_at timestamptz;

create function public.clear_conversation(p_conversation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and (buyer_id=actor or seller_id=actor)) then
    raise exception 'Conversation not found.';
  end if;
  update public.conversations set buyer_cleared_at=now() where id=p_conversation_id and buyer_id=actor;
  update public.conversations set seller_cleared_at=now() where id=p_conversation_id and seller_id=actor;
end;$$;
revoke all on function public.clear_conversation(uuid) from public,anon;
grant execute on function public.clear_conversation(uuid) to authenticated;

-- list_conversations(): hide a conversation the caller cleared, unless it has activity newer than
-- their own clear timestamp (a fresh message un-clears it automatically).
create or replace function public.list_conversations() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'listing_id',l.id,'listing_title',l.title,'listing_status',l.status,'listing_price_cents',l.price_cents,
    'role',case when c.buyer_id=auth.uid() then 'buyer' else 'seller' end,
    'counterparty_name',case when c.buyer_id=auth.uid() then seller.display_name else buyer.display_name end,
    'last_message_at',lm.created_at,'last_message_body',lm.body,
    'unread',lm.created_at is not null and lm.sender_id<>auth.uid() and lm.created_at>coalesce(case when c.buyer_id=auth.uid() then c.buyer_last_read_at else c.seller_last_read_at end,'-infinity'::timestamptz),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',x.path,'kind',x.kind)) from (select path,kind from public.listing_media where listing_id=l.id and kind='item' order by position limit 1) x),'[]'::jsonb)
  ) order by coalesce(lm.created_at,c.created_at) desc),'[]'::jsonb)
  from public.conversations c
  join public.listings l on l.id=c.listing_id
  join public.profiles buyer on buyer.id=c.buyer_id
  join public.profiles seller on seller.id=c.seller_id
  left join lateral (select body,created_at,sender_id from public.messages where conversation_id=c.id order by created_at desc limit 1) lm on true
  where (c.buyer_id=auth.uid() or c.seller_id=auth.uid())
    and coalesce(lm.created_at,c.created_at) > coalesce(case when c.buyer_id=auth.uid() then c.buyer_cleared_at else c.seller_cleared_at end,'-infinity'::timestamptz);
$$;
revoke all on function public.list_conversations() from public;
grant execute on function public.list_conversations() to authenticated;

commit;
