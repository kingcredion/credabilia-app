begin;

-- Checkout no longer starts the instant a buyer clicks Buy: the seller must first confirm the
-- item is still actually available (they may have sold it in person, or on another platform --
-- nothing in this app would ever know). One open request per listing at a time, same "no double
-- booking" guarantee reserve_listing_checkout already gave, just moved one step earlier.
create table public.availability_requests(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  status text not null check(status in ('pending','confirmed','declined','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz
);
create index availability_requests_listing on public.availability_requests(listing_id);
create index availability_requests_seller_pending on public.availability_requests(seller_id) where status='pending';
create index availability_requests_buyer_open on public.availability_requests(buyer_id) where status in ('pending','confirmed');
create unique index availability_requests_listing_open on public.availability_requests(listing_id) where status in ('pending','confirmed');
alter table public.availability_requests enable row level security;
revoke all on public.availability_requests from public,anon,authenticated;

create function public.request_to_buy(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; new_id uuid; new_expires timestamptz;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;

  -- Self-heal a listing stuck on 'pending' from an abandoned checkout or an expired/unanswered
  -- availability request -- no cron needed, same pattern reserve_listing_checkout already used.
  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();
  update public.availability_requests set status='expired' where listing_id=p_listing_id and status in ('pending','confirmed') and expires_at<now();
  update public.listings set status='active' where id=p_listing_id and status='pending'
    and not exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending')
    and not exists(select 1 from public.availability_requests where listing_id=p_listing_id and status in ('pending','confirmed'));

  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  new_expires:=now()+interval '24 hours';
  insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at)
    values(p_listing_id,actor,item.seller_id,'pending',new_expires)
    returning id into new_id;
  update public.listings set status='pending' where id=p_listing_id;

  perform public.notify_push(item.seller_id, 'Is "'||item.title||'" still available?', 'A buyer wants to purchase this item. Confirm or decline in your Sell dashboard.', '/?item='||p_listing_id);
  return jsonb_build_object('id',new_id,'listing_id',p_listing_id,'status','pending','expires_at',new_expires);
end;$$;
revoke all on function public.request_to_buy(uuid) from public,anon;
grant execute on function public.request_to_buy(uuid) to authenticated;

create function public.respond_to_buy_request(p_request_id uuid, p_available boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.availability_requests; item public.listings; new_status text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.availability_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been answered.'; end if;
  if request.expires_at<now() then raise exception 'This request has expired.'; end if;

  select * into item from public.listings where id=request.listing_id;
  new_status:=case when p_available then 'confirmed' else 'declined' end;
  update public.availability_requests set status=new_status, responded_at=now() where id=p_request_id;

  if p_available then
    perform public.notify_push(request.buyer_id, '"'||item.title||'" is still available', 'Complete your purchase before this expires.', '/?item='||request.listing_id);
  else
    update public.listings set status='active' where id=request.listing_id and status='pending';
    perform public.notify_push(request.buyer_id, '"'||item.title||'" is no longer available', 'The seller let us know this item has already sold elsewhere.', '/?item='||request.listing_id);
  end if;
  return jsonb_build_object('id',p_request_id,'status',new_status);
end;$$;
revoke all on function public.respond_to_buy_request(uuid,boolean) from public,anon;
grant execute on function public.respond_to_buy_request(uuid,boolean) to authenticated;

-- The buyer's own open (pending/confirmed) requests, with enough of the listing snapshotted in
-- that the item detail page can still render something useful even after the listing itself
-- drops out of browse_listings() (status is no longer 'active' while a request is open).
create function public.my_open_buy_requests() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',l.price_cents,'status',r.status,'expires_at',r.expires_at,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by r.created_at desc),'[]'::jsonb)
  from public.availability_requests r join public.listings l on l.id=r.listing_id
  where r.buyer_id=auth.uid() and r.status in ('pending','confirmed') and r.expires_at>now();
$$;
revoke all on function public.my_open_buy_requests() from public,anon;
grant execute on function public.my_open_buy_requests() to authenticated;

-- The seller's pending requests awaiting a Confirm/Decline response.
create function public.my_buy_requests() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'listing_id',l.id,'title',l.title,'price_cents',l.price_cents,'created_at',r.created_at,'expires_at',r.expires_at,
    'buyer_name',coalesce(p.display_name,'A collector'),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by r.created_at desc),'[]'::jsonb)
  from public.availability_requests r join public.listings l on l.id=r.listing_id join public.profiles p on p.id=r.buyer_id
  where r.seller_id=auth.uid() and r.status='pending' and r.expires_at>now();
$$;
revoke all on function public.my_buy_requests() from public,anon;
grant execute on function public.my_buy_requests() to authenticated;

-- Checkout now requires a confirmed, unexpired availability request from this exact buyer,
-- instead of just checking listings.status='active' -- the listing is already 'pending' (locked)
-- by the time a request has been confirmed, so that status check moves to request_to_buy(). Same
-- signature as the live function (202609250018_escrow_and_insurance.sql) -- p_want_insurance must
-- stay, or create-or-replace silently adds a second overload instead of replacing this function.
create or replace function public.reserve_listing_checkout(p_listing_id uuid, p_shipping_address jsonb, p_apply_credit_cents bigint default 0, p_want_insurance boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; seller_profile public.profiles;
  new_id uuid; balance bigint; credit_to_apply bigint:=0; avail public.availability_requests;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;
  if coalesce(btrim(p_shipping_address->>'name'),'')='' or coalesce(btrim(p_shipping_address->>'street1'),'')='' or coalesce(btrim(p_shipping_address->>'city'),'')=''
     or coalesce(btrim(p_shipping_address->>'state'),'')='' or coalesce(btrim(p_shipping_address->>'zip'),'')='' or coalesce(btrim(p_shipping_address->>'country'),'')='' then
    raise exception 'Fill in all required address fields.';
  end if;
  if coalesce(p_apply_credit_cents,0)<0 then raise exception 'Invalid credit amount.'; end if;

  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();

  select * into item from public.listings where id=p_listing_id for update;
  if not found then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  select * into avail from public.availability_requests where listing_id=p_listing_id and buyer_id=actor and status='confirmed' and expires_at>now() order by created_at desc limit 1;
  if not found then raise exception 'Ask the seller to confirm this item is still available before buying.'; end if;
  if item.status<>'pending' then raise exception 'This item is not available to buy.'; end if;

  select * into seller_account from public.stripe_accounts where user_id=item.seller_id;
  if not found or not seller_account.charges_enabled then raise exception 'This seller has not finished payment setup yet.'; end if;
  select * into seller_profile from public.profiles where id=item.seller_id;

  if coalesce(p_apply_credit_cents,0)>0 then
    select coalesce(sum(amount_cents),0) into balance from public.credit_events where user_id=actor;
    if p_apply_credit_cents>balance then raise exception 'You do not have that much credit available.'; end if;
    credit_to_apply:=least(p_apply_credit_cents, public.platform_fee_cents(item.price_cents));
  end if;

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at,shipping_address,applied_credit_cents,free_shipping,want_insurance)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes',p_shipping_address,credit_to_apply,item.free_shipping,coalesce(p_want_insurance,true))
    returning id into new_id;

  if credit_to_apply>0 then
    insert into public.credit_events(user_id,amount_cents,reason) values(actor,-credit_to_apply,'Applied to checkout');
  end if;

  return jsonb_build_object(
    'checkout_session_id',new_id,'price_cents',item.price_cents,'stripe_account_id',seller_account.stripe_account_id,'title',item.title,
    'applied_credit_cents',credit_to_apply,'free_shipping',item.free_shipping,'seller_shipping_address',seller_profile.shipping_address,
    'want_insurance',coalesce(p_want_insurance,true),
    'parcel',case when item.weight_oz is not null and item.length_in is not null and item.width_in is not null and item.height_in is not null
      then jsonb_build_object('weight_oz',item.weight_oz,'length_in',item.length_in,'width_in',item.width_in,'height_in',item.height_in)
      else null end
  );
end;$$;

-- Adds the two new pending states (awaiting seller confirmation / confirmed and awaiting buyer
-- checkout) to the same live-computed notification set message/refund states already use.
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
  ) x;
$$;

commit;
