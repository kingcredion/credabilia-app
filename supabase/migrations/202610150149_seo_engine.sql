begin;

-- SEO engine, database side. Everything here is additive: one new column, one trigger, replacement read-only functions and one operator report.
--
-- 1. listings.updated_at: a real "last changed" time, so sitemap lastmod and crawler freshness are honest. It moves only when something a search engine or a buyer
--    sees changes (title, description, price, category, details, tags, status, certificate fields), never for a bid count or a version bump. Existing rows start at
--    their created date, the best date we actually know.
alter table public.listings add column updated_at timestamptz not null default now();
update public.listings set updated_at=created_at;

create function public.touch_listing_updated_at() returns trigger
language plpgsql set search_path='' as $$
begin
  if (new.title,new.description,new.category,new.price_cents,new.attributes,new.tags,new.status,new.certificate_issuer,new.certificate_number,new.certificate_company)
     is distinct from
     (old.title,old.description,old.category,old.price_cents,old.attributes,old.tags,old.status,old.certificate_issuer,old.certificate_number,old.certificate_company) then
    new.updated_at:=now();
  end if;
  return new;
end;$$;
create trigger listings_touch_updated_at before update on public.listings for each row execute function public.touch_listing_updated_at();

-- A giveaway prize is not for sale. It keeps its own page (the giveaway's landing page) but is never described to search engines as a product with a price.
create function public.is_giveaway_prize(p_listing uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.giveaways g where g.listing_id=p_listing and g.status in ('active','drawn'));
$$;
revoke all on function public.is_giveaway_prize(uuid) from public;
grant execute on function public.is_giveaway_prize(uuid) to anon,authenticated,service_role;

-- 2. What the crawler layer needs to describe one public listing, using only facts the listing already shows. Active listings only.
create or replace function public.get_listing_preview(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'price_cents',l.price_cents,'category',l.category,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1),
    'attributes',coalesce(l.attributes,'{}'::jsonb),
    'certificate_issuer',l.certificate_issuer,'certificate_company',nullif(btrim(coalesce(l.certificate_company,'')),''),'certificate_has_number',l.certificate_number is not null,
    'listing_type',l.listing_type,'auction_ends_at',l.auction_ends_at,
    'created_at',l.created_at,'updated_at',l.updated_at,
    'seller_slug',p.slug,'seller_name',p.display_name,
    'giveaway_prize',public.is_giveaway_prize(l.id)
  )
  from public.listings l join public.profiles p on p.id=l.seller_id
  where l.id=p_id and l.status='active' and p.banned_at is null and p.deleted_at is null;
$$;

-- 3. The sitemap feed. Public means: active listing from a member in good standing. The old keys are kept (listings, storefronts) and dates and categories are added.
create or replace function public.sitemap_entries() returns jsonb
language sql stable security definer set search_path='' as $$
  with live as (
    select l.id,l.seller_id,l.category,l.created_at,l.updated_at,public.is_giveaway_prize(l.id) as prize
    from public.listings l join public.profiles p on p.id=l.seller_id
    where l.status='active' and p.banned_at is null and p.deleted_at is null
  )
  select jsonb_build_object(
    'listings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'created_at',created_at,'updated_at',updated_at) order by created_at) from live),'[]'::jsonb),
    'storefronts',coalesce((select jsonb_agg(p.slug order by p.slug) from public.profiles p where p.slug is not null and exists(select 1 from live where live.seller_id=p.id)),'[]'::jsonb),
    'storefront_entries',coalesce((select jsonb_agg(jsonb_build_object('slug',p.slug,'lastmod',(select max(live.updated_at) from live where live.seller_id=p.id)) order by p.slug)
      from public.profiles p where p.slug is not null and exists(select 1 from live where live.seller_id=p.id)),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('category',c.category,'count',c.n,'lastmod',c.last) order by c.category)
      from (select category,count(*)::int as n,max(updated_at) as last from live where not prize group by category) c),'[]'::jsonb)
  );
$$;

-- 4. A lightweight public list for crawler pages (home, category pages, related items): newest first, the giveaway prize left out.
create function public.seo_listing_index(p_category text default null, p_limit integer default 60, p_exclude uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'title',x.title,'price_cents',x.price_cents,'category',x.category,'seller_slug',x.slug,'created_at',x.created_at,'updated_at',x.updated_at
    ) order by x.created_at desc),'[]'::jsonb)
  from (
    select l.id,l.title,l.price_cents,l.category,p.slug,l.created_at,l.updated_at
    from public.listings l join public.profiles p on p.id=l.seller_id
    where l.status='active' and p.banned_at is null and p.deleted_at is null
      and (p_category is null or l.category=p_category) and (p_exclude is null or l.id<>p_exclude)
      and not public.is_giveaway_prize(l.id)
    order by l.created_at desc limit least(greatest(coalesce(p_limit,60),1),200)
  ) x;
$$;
revoke all on function public.seo_listing_index(text,integer,uuid) from public;
grant execute on function public.seo_listing_index(text,integer,uuid) to anon,authenticated,service_role;

-- 5. SEO health for the operator: what is eligible, what is missing. Sitemap inclusion is not the same as Google indexing; Search Console is the source for that.
create function public.seo_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only' using errcode='42501'; end if;
  return (
    with live as (
      select l.id,l.title,l.description,l.category,l.updated_at,public.is_giveaway_prize(l.id) as prize,
        exists(select 1 from public.listing_media m where m.listing_id=l.id and m.kind='item') as has_photo
      from public.listings l join public.profiles p on p.id=l.seller_id
      where l.status='active' and p.banned_at is null and p.deleted_at is null
    )
    select jsonb_build_object(
      'indexable_listings',(select count(*) from live),
      'sitemap_listing_urls',(select count(*) from live),
      'giveaway_prizes_in_sitemap',(select count(*) from live where prize),
      'missing_photo',(select count(*) from live where not has_photo),
      'thin_description',(select count(*) from live where length(btrim(coalesce(description,'')))<40),
      'short_title',(select count(*) from live where length(btrim(title))<12),
      'storefronts_with_slug',(select count(*) from public.profiles p where p.slug is not null and exists(select 1 from live where exists(select 1 from public.listings l where l.id=live.id and l.seller_id=p.id))),
      'categories_with_inventory',(select count(distinct category) from live where not prize),
      'duplicate_titles',(select count(*) from (select lower(btrim(title)) from live group by 1 having count(*)>1) d),
      'newest_change',(select max(updated_at) from live)
    )
  );
end;$$;
revoke all on function public.seo_health() from public,anon;
grant execute on function public.seo_health() to authenticated;

-- 6. "/category/<name>" is a public page, so no seller may claim "category" as a store name.
create or replace function public.update_store_slug(p_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=lower(btrim(p_slug));
  if clean !~ '^[a-z0-9][a-z0-9-]{2,29}$' then raise exception 'Use 3-30 characters: lowercase letters, numbers, and hyphens only.'; end if;
  if clean=any(array['auth','api','admin','app','www','static','assets','terms','privacy','legal','support','help','sell','item','img','certificate','giveaway-rules','category']) then raise exception 'That store name is reserved. Choose another.'; end if;
  update public.profiles set slug=clean where id=actor;
exception when unique_violation then raise exception 'That store name is already taken.';
end;$$;
revoke all on function public.update_store_slug(text) from public,anon;
grant execute on function public.update_store_slug(text) to authenticated;

commit;
