begin;

-- Placeholder listings. While the marketplace is small, the operator's own stand-in items (listed under a member account, not a real seller) fill the shelves. They must
-- never sit above what real sellers post, so a seller named here is sorted after everyone else everywhere listings are ranked (the Discover feed, its "load more" paging, and the
-- crawler lists). Nothing about the listings themselves changes: still active, still buyable, still in the sitemap. Remove a row and the seller sorts by date again.
-- sort_at is the ordering key: the real created_at, pushed far into the past for a placeholder seller. It is also the paging cursor, so paging stays stable.
create table public.placeholder_sellers(
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.placeholder_sellers enable row level security;
revoke all on public.placeholder_sellers from public,anon,authenticated;

insert into public.placeholder_sellers(seller_id,note)
select u.id,'Operator placeholder items until the marketplace grows' from auth.users u join public.profiles p on p.id=u.id where lower(u.email)='davyartiz@gmail.com';

create function public.listing_sort_at(p_seller uuid, p_created timestamptz) returns timestamptz
language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.placeholder_sellers where seller_id=p_seller) then p_created - interval '100 years' else p_created end;
$$;
revoke all on function public.listing_sort_at(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.listing_sort_at(uuid,timestamptz) to service_role;

-- browse_listings gains sort_at (a new output column, so it is dropped and recreated; the caller below is recreated in the same transaction).
drop function public.browse_listings(integer,timestamptz,uuid);
create function public.browse_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table(id uuid,seller_id uuid,seller_name text,title text,description text,evidence text,category text,price_cents bigint,status text,needs_review_reason text,created_at timestamptz,audit_count bigint,version integer,listing_type text,auction_ends_at timestamptz,bid_count integer,sort_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id,l.seller_id,p.display_name,l.title,l.description,l.evidence,l.category,l.price_cents,l.status,l.needs_review_reason,l.created_at,
    (select count(*) from public.audits a where a.listing_id = l.id and a.listing_version = l.version),
    l.version,l.listing_type,l.auction_ends_at,l.bid_count,k.sort_at
  from public.listings l join public.profiles p on p.id = l.seller_id
  cross join lateral (select case when exists(select 1 from public.placeholder_sellers ph where ph.seller_id=l.seller_id) then l.created_at - interval '100 years' else l.created_at end as sort_at) k
  where (l.status = 'active' or (l.status = 'needs_review' and l.seller_id = auth.uid()))
    and (p_after_created_at is null or (k.sort_at,l.id) < (p_after_created_at,p_after_id))
  order by k.sort_at desc, l.id desc
  limit least(coalesce(p_limit,300),300);
$$;
revoke all on function public.browse_listings(integer,timestamptz,uuid) from public;
grant execute on function public.browse_listings(integer,timestamptz,uuid) to anon, authenticated;

-- The feed keeps the same order browse_listings chose (it is an aggregate over it, so its own order by must agree).
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.browse_scored_listings(integer,timestamp with time zone,uuid)'::regprocedure) into def;
  patched:=replace(def,'order by s.created_at desc,s.id desc','order by s.sort_at desc,s.id desc');
  if patched=def then raise exception 'browse_scored_listings did not contain the expected order by'; end if;
  execute patched;
end;
$patch$;

-- Crawler lists (home, category pages, related items) follow the same rule.
create or replace function public.seo_listing_index(p_category text default null, p_limit integer default 60, p_exclude uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'title',x.title,'price_cents',x.price_cents,'category',x.category,'seller_slug',x.slug,'created_at',x.created_at,'updated_at',x.updated_at
    ) order by x.sort_at desc,x.id desc),'[]'::jsonb)
  from (
    select l.id,l.title,l.price_cents,l.category,p.slug,l.created_at,l.updated_at,public.listing_sort_at(l.seller_id,l.created_at) as sort_at
    from public.listings l join public.profiles p on p.id=l.seller_id
    where l.status='active' and p.banned_at is null and p.deleted_at is null
      and (p_category is null or l.category=p_category) and (p_exclude is null or l.id<>p_exclude)
      and not public.is_giveaway_prize(l.id)
    order by public.listing_sort_at(l.seller_id,l.created_at) desc,l.id desc limit least(greatest(coalesce(p_limit,60),1),200)
  ) x;
$$;

commit;
