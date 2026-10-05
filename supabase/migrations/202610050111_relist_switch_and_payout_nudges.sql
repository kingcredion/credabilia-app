begin;

-- 1. Ended auctions the seller can relist, 2. switching a listing between fixed price and auction, 3. nudges for sellers who published but have
-- not finished Stripe payout setup.

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Why a listing was archived. Only auctions that closed on their own (no bids, or nobody paid) are relistable by the seller; anything an
-- operator removed, or a seller deleted, is not.
alter table public.listings add column archived_reason text;

create function public.tag_archived_reason() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='archived' and old.status<>'archived' and new.listing_type='auction' and coalesce(current_setting('app.auction_internal',true),'')='1' then
    new.archived_reason:=case when new.bid_count=0 then 'auction_no_bids' else 'auction_unpaid' end;
  end if;
  return new;
end;$$;
create trigger tag_archived_reason before update on public.listings for each row execute function public.tag_archived_reason();

-- a relisted auction starts a new round: the old round's bids are kept as history, not deleted
create table public.bids_archive (like public.bids including defaults, archived_at timestamptz not null default now());
alter table public.bids_archive enable row level security;
revoke all on public.bids_archive from public,anon,authenticated;

create function public.my_ended_listings() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'category',l.category,'price_cents',l.price_cents,'listing_type',l.listing_type,
    'bid_count',l.bid_count,'reason',l.archived_reason,'auction_days',l.auction_days,'ended_at',l.auction_ends_at,
    'media',(select coalesce(jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position),'[]'::jsonb) from public.listing_media m where m.listing_id=l.id)
  ) order by l.auction_ends_at desc),'[]'::jsonb)
  from public.listings l where l.seller_id=auth.uid() and l.status='archived' and l.archived_reason in ('auction_no_bids','auction_unpaid');
$$;
revoke all on function public.my_ended_listings() from public,anon;
grant execute on function public.my_ended_listings() to authenticated;

create function public.relist_ended_listing(p_id uuid, p_type text, p_price_cents bigint, p_auction_days integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.listings; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into item from public.listings where id=p_id for update;
  if not found or item.seller_id<>actor then raise exception 'You can only relist your own listing' using errcode='42501'; end if;
  if item.status<>'archived' or coalesce(item.archived_reason,'') not in ('auction_no_bids','auction_unpaid') then raise exception 'This listing cannot be relisted.'; end if;
  if p_type not in ('fixed','auction') then raise exception 'Choose fixed price or auction.'; end if;
  if p_price_cents is null or p_price_cents<100 or p_price_cents>100000000 then raise exception 'Enter a price between $1 and $1,000,000.'; end if;
  if p_type='auction' and p_auction_days not in (3,5,7) then raise exception 'Choose a 3, 5, or 7 day auction.'; end if;
  perform set_config('app.auction_internal','1',true);
  insert into public.bids_archive select b.*,now() from public.bids b where b.listing_id=p_id;
  delete from public.bids where listing_id=p_id;
  delete from public.auction_state where listing_id=p_id;
  update public.listings set status='active',archived_reason=null,listing_type=p_type,price_cents=p_price_cents,bid_count=0,
    auction_days=case when p_type='auction' then p_auction_days else null end,
    auction_ends_at=case when p_type='auction' then now()+make_interval(days=>p_auction_days) else null end
    where id=p_id;
  return p_id;
end;$$;
revoke all on function public.relist_ended_listing(uuid,text,bigint,integer) from public,anon;
grant execute on function public.relist_ended_listing(uuid,text,bigint,integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Switch a live listing between fixed price and auction. Only while nothing is in motion: no bids, no purchase request, no checkout.
create function public.change_listing_type(p_id uuid, p_type text, p_auction_days integer default null) returns void
language plpgsql security definer set search_path='' as $$
declare item public.listings; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into item from public.listings where id=p_id for update;
  if not found or item.seller_id<>actor then raise exception 'You can only change your own listing' using errcode='42501'; end if;
  if item.status='pending' then raise exception 'A buyer is in the middle of buying this item, so it cannot be switched right now.'; end if;
  if item.status<>'active' then raise exception 'Only a live listing can be switched.'; end if;
  if p_type not in ('fixed','auction') then raise exception 'Choose fixed price or auction.'; end if;
  if item.listing_type=p_type then raise exception 'This listing is already %.',case when p_type='auction' then 'an auction' else 'fixed price' end; end if;
  if item.bid_count>0 then raise exception 'This auction already has bids, so it cannot be switched.'; end if;
  if exists(select 1 from public.availability_requests where listing_id=p_id and status in ('pending','confirmed'))
     or exists(select 1 from public.checkout_sessions where listing_id=p_id and status='pending' and expires_at>now()) then
    raise exception 'A buyer is in the middle of buying this item, so it cannot be switched right now.';
  end if;
  if p_type='auction' and p_auction_days not in (3,5,7) then raise exception 'Choose a 3, 5, or 7 day auction.'; end if;
  perform set_config('app.auction_internal','1',true);
  update public.listings set listing_type=p_type,
    auction_days=case when p_type='auction' then p_auction_days else null end,
    auction_ends_at=case when p_type='auction' then now()+make_interval(days=>p_auction_days) else null end
    where id=p_id;
end;$$;
revoke all on function public.change_listing_type(uuid,text,integer) from public,anon;
grant execute on function public.change_listing_type(uuid,text,integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Payout setup nudges. The first time a seller publishes while they cannot be paid they get an email event + push; a daily reminder follows
-- (at most 3 more, 3 days apart) until they finish. Unlocking is handled in 202610050110.
create table public.payout_setup_notices (
  user_id uuid primary key references public.profiles(id),
  last_sent_at timestamptz not null default now(),
  sent_count integer not null default 1
);
alter table public.payout_setup_notices enable row level security;
revoke all on public.payout_setup_notices from public,anon,authenticated;

create function public.notify_payout_setup_needed() returns trigger
language plpgsql security definer set search_path='' as $$
declare locked_count integer;
begin
  if new.status='active' and not public.seller_can_be_paid(new.seller_id)
     and not exists(select 1 from public.payout_setup_notices where user_id=new.seller_id) then
    select count(*) into locked_count from public.listings where seller_id=new.seller_id and status='active';
    insert into public.payout_setup_notices(user_id) values(new.seller_id) on conflict do nothing;
    perform public.notify_push(new.seller_id,'One step left to get paid','Your listing is visible but locked until you connect payouts with Stripe. It takes a couple of minutes.','/');
    perform public.notify_klaviyo_user(new.seller_id,'Payout Setup Needed',jsonb_build_object('title',new.title,'listing_count',locked_count));
  end if;
  return null;
end;$$;
create constraint trigger notify_payout_setup_needed after insert on public.listings deferrable initially deferred for each row execute function public.notify_payout_setup_needed();

create function public.send_payout_setup_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare seller record; sent integer:=0;
begin
  for seller in
    select l.seller_id,count(*) as listing_count,min(l.title) as title
    from public.listings l
    where l.status='active' and l.created_at<now()-interval '24 hours' and not public.seller_can_be_paid(l.seller_id)
    group by l.seller_id loop
    if exists(select 1 from public.payout_setup_notices n where n.user_id=seller.seller_id and (n.sent_count>=4 or n.last_sent_at>now()-interval '3 days')) then continue; end if;
    insert into public.payout_setup_notices(user_id) values(seller.seller_id)
      on conflict (user_id) do update set last_sent_at=now(),sent_count=public.payout_setup_notices.sent_count+1;
    perform public.notify_push(seller.seller_id,'Your listings are waiting on payout setup','Buyers can see them but cannot buy or bid until you connect payouts with Stripe.','/');
    perform public.notify_klaviyo_user(seller.seller_id,'Payout Setup Reminder',jsonb_build_object('title',seller.title,'listing_count',seller.listing_count));
    sent:=sent+1;
  end loop;
  return sent;
end;$$;
revoke all on function public.send_payout_setup_reminders() from public,anon,authenticated;
grant execute on function public.send_payout_setup_reminders() to service_role;

commit;
