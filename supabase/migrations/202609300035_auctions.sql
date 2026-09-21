begin;

-- Auctions ----------------------------------------------------------------------------------
-- price_cents doubles as "current price" for an auction (starting bid, then the highest bid as
-- bidding proceeds) -- every existing card/detail render that already shows money(item.price_cents)
-- keeps working unmodified for auctions, no special-casing needed across the app.

alter table public.listings
  add column listing_type text not null default 'fixed' check (listing_type in ('fixed','auction')),
  add column auction_ends_at timestamptz,
  add column bid_count integer not null default 0;

create table public.bids(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  bidder_id uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
create index bids_listing on public.bids(listing_id, amount_cents desc);
alter table public.bids enable row level security;
revoke all on public.bids from public,anon,authenticated;
grant select on public.bids to authenticated;
-- Individual bids stay private to the bidder and the seller (like seller_ratings) -- everyone
-- else only ever sees the public current price/bid_count via browse_listings(), not who bid what.
create policy bids_bidder on public.bids for select to authenticated using (bidder_id=(select auth.uid()));
create policy bids_seller on public.bids for select to authenticated using (exists(select 1 from public.listings l where l.id=bids.listing_id and l.seller_id=(select auth.uid())));

create function public.place_bid(p_listing_id uuid, p_amount_cents bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; new_bid public.bids; minimum bigint;
begin
  if actor is null then raise exception 'Sign in to bid' using errcode='42501'; end if;
  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' or item.listing_type<>'auction' then raise exception 'This auction is not available for bidding.'; end if;
  if item.auction_ends_at<=now() then raise exception 'This auction has ended.'; end if;
  if item.seller_id=actor then raise exception 'You cannot bid on your own listing.'; end if;
  -- First bid must clear the starting price; every bid after must beat the current price by a
  -- flat $1 minimum -- simple fixed increment, no proxy/max-bidding, matches what we agreed on.
  minimum:=case when item.bid_count=0 then item.price_cents else item.price_cents+100 end;
  if p_amount_cents<minimum then raise exception 'Enter a higher bid.'; end if;
  insert into public.bids(listing_id,bidder_id,amount_cents) values(p_listing_id,actor,p_amount_cents) returning * into new_bid;
  update public.listings set price_cents=p_amount_cents,bid_count=bid_count+1 where id=p_listing_id;
  return jsonb_build_object('id',new_bid.id,'amount_cents',new_bid.amount_cents,'bid_count',item.bid_count+1);
end;$$;
revoke all on function public.place_bid(uuid,bigint) from public,anon;
grant execute on function public.place_bid(uuid,bigint) to authenticated;

-- create_listing_with_details() grows two new, optional, trailing params -- every existing caller
-- (demo.js parity aside) keeps working unchanged since they default to a plain fixed-price listing.
-- CREATE OR REPLACE does NOT consolidate a changed parameter *count* into one function -- it
-- silently adds a second overload instead, so the old 16-param signature (live in
-- 202609240016_fees_shipping_rewards.sql) must be dropped explicitly first.
drop function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean);
create function public.create_listing_with_details(
  p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',
  p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',
  p_attributes jsonb default '{}',p_tags jsonb default '[]',
  p_weight_oz numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,
  p_free_shipping boolean default false,
  p_listing_type text default 'fixed',p_auction_days integer default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; field record; tag jsonb; clean_attributes jsonb:='{}'; clean_tags jsonb:='[]'; clean text;
  allowed text[]:=array['item_type','subject','year','condition','grading_company','grade'];
begin
  if p_listing_type not in ('fixed','auction') then raise exception 'Invalid listing type.'; end if;
  if p_listing_type='auction' and p_auction_days not in (3,5,7) then raise exception 'Choose a 3, 5, or 7 day auction.'; end if;
  if p_category='Sports' then allowed:=allowed||array['sport','team'];
  elsif p_category='Art' then allowed:=allowed||array['artist','medium','dimensions'];
  elsif p_category='Comics' then allowed:=allowed||array['publisher','issue']; end if;
  if p_attributes is null or jsonb_typeof(p_attributes)<>'object' then raise exception 'Invalid item details'; end if;
  for field in select * from jsonb_each(p_attributes) loop
    if not(field.key=any(allowed)) or jsonb_typeof(field.value)<>'string' then raise exception 'Unsupported item detail'; end if;
    clean:=btrim(field.value#>>'{}');
    if length(clean)>120 then raise exception 'Item detail too long'; end if;
    if clean<>'' then clean_attributes:=clean_attributes||jsonb_build_object(field.key,clean); end if;
  end loop;
  if p_tags is null or jsonb_typeof(p_tags)<>'array' then raise exception 'Invalid tags'; end if;
  for tag in select * from jsonb_array_elements(p_tags) loop
    if jsonb_typeof(tag)<>'string' then raise exception 'Invalid tag'; end if;
    clean:=lower(regexp_replace(btrim(tag#>>'{}'),'\s+',' ','g'));
    if length(clean)>40 then raise exception 'Tag too long'; end if;
    if clean<>'' and not(clean_tags ? clean) then clean_tags:=clean_tags||jsonb_build_array(clean); end if;
  end loop;
  if jsonb_array_length(clean_tags)>8 then raise exception 'Too many tags'; end if;
  if p_weight_oz is null or p_weight_oz<=0 or p_length_in is null or p_length_in<=0
     or p_width_in is null or p_width_in<=0 or p_height_in is null or p_height_in<=0 then
    raise exception 'Enter a valid package weight and size.';
  end if;
  new_id:=public.create_listing_with_media(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company,p_media);
  update public.listings set attributes=clean_attributes,tags=clean_tags,
    weight_oz=p_weight_oz,length_in=p_length_in,width_in=p_width_in,height_in=p_height_in,free_shipping=coalesce(p_free_shipping,false),
    listing_type=p_listing_type,auction_ends_at=case when p_listing_type='auction' then now()+make_interval(days=>p_auction_days) else null end
    where id=new_id;
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer) from public,anon;
grant execute on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer) to authenticated;

-- An auction listing can't be bought outright through the ordinary ask-to-buy path -- bidding is
-- the only way in while it's running. Same 1-param signature as the live function
-- (202609300033_buy_availability_confirmation.sql).
create or replace function public.request_to_buy(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; new_id uuid; new_expires timestamptz;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;

  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();
  update public.availability_requests set status='expired' where listing_id=p_listing_id and status in ('pending','confirmed') and expires_at<now();
  update public.listings set status='active' where id=p_listing_id and status='pending'
    and not exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending')
    and not exists(select 1 from public.availability_requests where listing_id=p_listing_id and status in ('pending','confirmed'));

  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.listing_type='auction' then raise exception 'This item is up for auction — place a bid instead.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  new_expires:=now()+interval '24 hours';
  insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at)
    values(p_listing_id,actor,item.seller_id,'pending',new_expires)
    returning id into new_id;
  update public.listings set status='pending' where id=p_listing_id;

  perform public.notify_push(item.seller_id, 'Is "'||item.title||'" still available?', 'A buyer wants to purchase this item. Confirm or decline in your Sell dashboard.', '/?item='||p_listing_id);
  return jsonb_build_object('id',new_id,'listing_id',p_listing_id,'status','pending','expires_at',new_expires);
end;$$;

-- Add the new auction columns to the base listing feed -- they flow through the existing
-- browse_scored_listings -> browse_listings_with_media -> browse_listings_with_certificates chain
-- automatically (each wrapper does `b.*`/`to_jsonb(s)`, not a fixed column list), so none of those
-- three functions need to be touched. Same 12-column signature as the live function
-- (202609190011_listing_history.sql) with three new trailing columns appended.
drop function public.browse_listings();
create function public.browse_listings()
returns table(id uuid,seller_id uuid,seller_name text,title text,description text,evidence text,category text,price_cents bigint,status text,created_at timestamptz,audit_count bigint,version integer,listing_type text,auction_ends_at timestamptz,bid_count integer)
language sql stable security definer set search_path = '' as $$
  select l.id,l.seller_id,p.display_name,l.title,l.description,l.evidence,l.category,l.price_cents,l.status,l.created_at,
    (select count(*) from public.audits a where a.listing_id = l.id and a.listing_version = l.version),
    l.version,l.listing_type,l.auction_ends_at,l.bid_count
  from public.listings l join public.profiles p on p.id = l.seller_id
  where l.status = 'active'
  order by l.created_at desc, l.id limit 100;
$$;
revoke all on function public.browse_listings() from public;
grant execute on function public.browse_listings() to anon, authenticated;

-- Settlement: service-role only, called by the hourly cron sweep (close-auctions edge function).
-- Reuses the exact same "confirmed availability request" state a regular buy-request-confirmed
-- purchase already uses -- the winner lands on the same "seller confirmed, continue to checkout"
-- screen, and reserve_listing_checkout/my_notifications/notify_push all already handle it, so
-- almost none of the post-auction buyer experience is new code.
create function public.settle_ended_auctions() returns integer
language plpgsql security definer set search_path='' as $$
declare item record; winning_bidder uuid; settled integer:=0; new_request_id uuid;
begin
  for item in select * from public.listings where listing_type='auction' and status='active' and auction_ends_at<=now() for update skip locked loop
    select bidder_id into winning_bidder from public.bids where listing_id=item.id order by amount_cents desc, created_at asc limit 1;
    if winning_bidder is not null then
      insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at,responded_at)
        values(item.id,winning_bidder,item.seller_id,'confirmed',now()+interval '48 hours',now())
        returning id into new_request_id;
      update public.listings set status='pending' where id=item.id;
      perform public.notify_push(winning_bidder, 'You won "'||item.title||'"!', 'Complete your purchase before this expires.', '/?item='||item.id);
      perform public.notify_push(item.seller_id, '"'||item.title||'" auction ended', 'The auction sold — the winning bidder can now check out.', '/?item='||item.id);
    else
      update public.listings set status='archived' where id=item.id;
    end if;
    settled:=settled+1;
  end loop;
  return settled;
end;$$;
revoke all on function public.settle_ended_auctions() from public,anon,authenticated;
grant execute on function public.settle_ended_auctions() to service_role;

commit;
