begin;

-- Messaging moves from purchase-scoped to conversation-scoped: a thread now exists per
-- (listing, buyer) pair -- created the moment a buyer clicks "Message seller" on a listing page or
-- card -- instead of only existing after checkout completes. purchases.listing_id is already
-- unique, so every existing purchase already *is* exactly one (listing_id, buyer_id, seller_id)
-- triple; the backfill below turns each into its own conversation with zero ambiguity, and every
-- historical message carries over untouched.

create table public.conversations(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  buyer_last_read_at timestamptz,
  seller_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  unique(listing_id, buyer_id)
);
create index conversations_buyer on public.conversations(buyer_id, created_at desc);
create index conversations_seller on public.conversations(seller_id, created_at desc);
alter table public.conversations enable row level security;
-- No direct grants at all -- same "everything through security-definer RPCs" posture as messages.
revoke all on public.conversations from public,anon,authenticated;

insert into public.conversations(listing_id,buyer_id,seller_id,buyer_last_read_at,seller_last_read_at,created_at)
select p.listing_id,p.buyer_id,p.seller_id,p.buyer_last_read_at,p.seller_last_read_at,p.created_at
from public.purchases p;

alter table public.purchases add column conversation_id uuid references public.conversations(id);
update public.purchases p set conversation_id=c.id from public.conversations c where c.listing_id=p.listing_id and c.buyer_id=p.buyer_id;
alter table public.purchases alter column conversation_id set not null;
alter table public.purchases drop column buyer_last_read_at;
alter table public.purchases drop column seller_last_read_at;

alter table public.messages add column conversation_id uuid references public.conversations(id);
update public.messages m set conversation_id=p.conversation_id from public.purchases p where p.id=m.purchase_id;
alter table public.messages alter column conversation_id set not null;
alter table public.messages drop column purchase_id;
create index messages_conversation on public.messages(conversation_id, created_at);

-- finalize_checkout_session() is the sole insertion point into purchases (confirmed: every other
-- migration touching "insert into public.purchases" is an earlier redefinition of this same
-- function). purchases.conversation_id is now not null, so every purchase needs one -- reusing an
-- existing pre-purchase conversation for (listing_id, buyer_id) if the buyer already messaged the
-- seller, or creating one on the spot otherwise. Same body as 202609300059_pickup_checkout.sql
-- otherwise, just adding conv_id.
create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint; seller_ship_charge bigint; is_insured boolean; insured_value bigint; conv_id uuid;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found then raise exception 'Checkout session not found.'; end if;

  if target.status='completed' then
    select id into new_id from public.purchases where listing_id=target.listing_id and buyer_id=target.buyer_id;
    return new_id;
  end if;
  if target.status<>'pending' then raise exception 'This checkout session is no longer active.'; end if;

  select id into conv_id from public.conversations where listing_id=target.listing_id and buyer_id=target.buyer_id;
  if conv_id is null then
    insert into public.conversations(listing_id,buyer_id,seller_id) values(target.listing_id,target.buyer_id,target.seller_id) returning id into conv_id;
  end if;

  fee:=public.platform_fee_cents(target.price_cents);
  seller_ship_charge:=case when target.free_shipping then coalesce(target.shipping_cost_cents,0) else 0 end;
  is_insured:=target.want_insurance and coalesce(target.insurance_cost_cents,0)>0;
  insured_value:=case when is_insured then least(target.price_cents,1000000) else 0 end;
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents,shipping_address,shipping_cost_cents,seller_shipping_charge_cents,applied_credit_cents,insured,insured_value_cents,insurance_cost_cents,fulfillment_method,pickup_station_id,conversation_id)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee,target.shipping_address,coalesce(target.shipping_cost_cents,0),seller_ship_charge,coalesce(target.applied_credit_cents,0),is_insured,insured_value,coalesce(target.insurance_cost_cents,0),target.fulfillment_method,target.pickup_station_id,conv_id)
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;

-- send_message / get_messages / mark_messages_read keep their (uuid[,text]) argument *types* --
-- but Postgres refuses to rename a parameter via create or replace ("cannot change name of input
-- parameter"), so each needs an explicit drop first.
drop function public.send_message(uuid,text);
drop function public.get_messages(uuid);
drop function public.mark_messages_read(uuid);

create function public.send_message(p_conversation_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz; sender_name text;
  conv public.conversations; recipient uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  select * into conv from public.conversations where id=p_conversation_id and (buyer_id=actor or seller_id=actor);
  if not found then raise exception 'Conversation not found.'; end if;
  recipient:=case when conv.buyer_id=actor then conv.seller_id else conv.buyer_id end;
  if exists(select 1 from public.blocks where (blocker_id=actor and blocked_id=recipient) or (blocker_id=recipient and blocked_id=actor)) then
    raise exception 'You cannot message this user.';
  end if;
  insert into public.messages(conversation_id,sender_id,body) values(p_conversation_id,actor,clean) returning id,created_at into new_id,new_created;
  select display_name into sender_name from public.profiles where id=actor;
  perform public.notify_push(recipient, coalesce(sender_name,'A collector')||' sent you a message', left(clean,120), '/?conversation='||p_conversation_id);
  return jsonb_build_object('id',new_id,'body',clean,'created_at',new_created,'sender_id',actor,'sender_name',sender_name);
end;$$;

create function public.get_messages(p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and (buyer_id=actor or seller_id=actor)) then
    raise exception 'Conversation not found.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'body',m.body,'created_at',m.created_at,'sender_id',m.sender_id,'sender_name',p.display_name
  ) order by m.created_at) from public.messages m join public.profiles p on p.id=m.sender_id where m.conversation_id=p_conversation_id),'[]'::jsonb);
end;$$;

create function public.mark_messages_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and (buyer_id=actor or seller_id=actor)) then
    raise exception 'Conversation not found.';
  end if;
  update public.conversations set buyer_last_read_at=now() where id=p_conversation_id and buyer_id=actor;
  update public.conversations set seller_last_read_at=now() where id=p_conversation_id and seller_id=actor;
end;$$;
-- Dropping send_message/get_messages/mark_messages_read above also dropped their prior grants --
-- re-issue the same authenticated-only access as before.
revoke all on function public.send_message(uuid,text) from public,anon;
grant execute on function public.send_message(uuid,text) to authenticated;
revoke all on function public.get_messages(uuid) from public,anon;
grant execute on function public.get_messages(uuid) to authenticated;
revoke all on function public.mark_messages_read(uuid) from public,anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- Buyer-initiated only: a "Message seller" click on a listing page or card gets-or-creates the one
-- conversation for (that listing, this buyer). Sellers never cold-start a conversation -- they only
-- ever respond inside one a buyer already opened, listed via list_conversations().
create function public.get_or_create_conversation(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; conv public.conversations;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into item from public.listings where id=p_listing_id;
  if not found then raise exception 'Listing not found.'; end if;
  if item.seller_id=actor then raise exception 'You cannot message yourself about your own listing.'; end if;
  if exists(select 1 from public.blocks where (blocker_id=actor and blocked_id=item.seller_id) or (blocker_id=item.seller_id and blocked_id=actor)) then
    raise exception 'You cannot message this seller.';
  end if;
  select * into conv from public.conversations where listing_id=p_listing_id and buyer_id=actor;
  if not found then
    insert into public.conversations(listing_id,buyer_id,seller_id) values(p_listing_id,actor,item.seller_id) returning * into conv;
  end if;
  return jsonb_build_object('id',conv.id,'listing_id',item.id,'listing_title',item.title,'listing_status',item.status,'listing_price_cents',item.price_cents,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',x.path,'kind',x.kind)) from (select path,kind from public.listing_media where listing_id=item.id and kind='item' order by position limit 1) x),'[]'::jsonb));
end;$$;
revoke all on function public.get_or_create_conversation(uuid) from public,anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- The inbox: every conversation this user is part of, newest activity first, with enough of the
-- pinned listing (title/photo/status/price) to render a thumbnail card, and an unread flag.
create function public.list_conversations() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'listing_id',l.id,'listing_title',l.title,'listing_status',l.status,'listing_price_cents',l.price_cents,
    'role',case when c.buyer_id=auth.uid() then 'buyer' else 'seller' end,
    'counterparty_name',case when c.buyer_id=auth.uid() then seller.display_name else buyer.display_name end,
    'last_message_at',lm.created_at,'last_message_body',lm.body,
    -- Only unread if the OTHER party sent it -- a naive time-vs-last-read comparison alone would
    -- flag your own just-sent message as unread to yourself.
    'unread',lm.created_at is not null and lm.sender_id<>auth.uid() and lm.created_at>coalesce(case when c.buyer_id=auth.uid() then c.buyer_last_read_at else c.seller_last_read_at end,'-infinity'::timestamptz),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',x.path,'kind',x.kind)) from (select path,kind from public.listing_media where listing_id=l.id and kind='item' order by position limit 1) x),'[]'::jsonb)
  ) order by coalesce(lm.created_at,c.created_at) desc),'[]'::jsonb)
  from public.conversations c
  join public.listings l on l.id=c.listing_id
  join public.profiles buyer on buyer.id=c.buyer_id
  join public.profiles seller on seller.id=c.seller_id
  left join lateral (select body,created_at,sender_id from public.messages where conversation_id=c.id order by created_at desc limit 1) lm on true
  where c.buyer_id=auth.uid() or c.seller_id=auth.uid();
$$;
revoke all on function public.list_conversations() from public;
grant execute on function public.list_conversations() to authenticated;

-- my_notifications(): message branches now read from conversations; every branch grows a new
-- conversation_id column (null for the non-message kinds) so the client can route straight into
-- the right thread instead of the listing page.
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
      'Mark "'||l.title||'" picked up once you''ve handed it off', p.created_at, null::uuid
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.seller_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.seller_marked_picked_up_at is null

    union all

    select 'pickup_awaiting_confirmation', 'buyer', p.id, l.id, l.title,
      'Confirm you picked up "'||l.title||'"', p.seller_marked_picked_up_at, null::uuid
    from public.purchases p join public.listings l on l.id=p.listing_id
    where p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held'
      and p.seller_marked_picked_up_at is not null and p.buyer_confirmed_pickup_at is null
  ) x;
$$;

-- my_sales() / my_purchases(): message_count + conversation_id now read through
-- purchases.conversation_id instead of purchase_id directly. Everything else byte-identical to
-- 202609300061_fix_pickup_sales_purchases_regression.sql.

create or replace function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shipping_cost_cents',p.shipping_cost_cents,'seller_shipping_charge_cents',p.seller_shipping_charge_cents,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'funds_released_at',p.funds_released_at,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'conversation_id',p.conversation_id,
    'message_count',(select count(*)::int from public.messages where conversation_id=p.conversation_id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.pickup_stations ps on ps.id=p.pickup_station_id
  where p.seller_id=auth.uid();
$$;

create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,'shipping_cost_cents',p.shipping_cost_cents,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'insured',p.insured,'insurance_cost_cents',p.insurance_cost_cents,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'conversation_id',p.conversation_id,
    'message_count',(select count(*)::int from public.messages where conversation_id=p.conversation_id),
    'my_rating',sr.rating,'my_rating_comment',sr.comment,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.seller_ratings sr on sr.purchase_id=p.id
  left join public.pickup_stations ps on ps.id=p.pickup_station_id
  where p.buyer_id=auth.uid();
$$;

commit;
