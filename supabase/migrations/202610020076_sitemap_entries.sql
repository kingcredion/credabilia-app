begin;

-- Backs a dynamically generated /sitemap.xml (served by middleware.js) -- the static
-- public/sitemap.xml only ever listed 4 fixed pages, so every real listing and storefront was
-- invisible to search engines. Returns just enough to build <url> entries: active listing ids
-- (+ created_at for <lastmod>, since listings has no updated_at column) and the slugs of sellers
-- who have a storefront and at least one active listing -- an empty/abandoned storefront isn't
-- worth a sitemap entry. Anon-readable: this is strictly less than what browse_listings_with_certificates()
-- and get_storefront() already expose publicly.
create function public.sitemap_entries() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id',id,'created_at',created_at)) from public.listings where status='active'),'[]'::jsonb),
    'storefronts', coalesce((select jsonb_agg(p.slug) from public.profiles p
      where p.slug is not null and exists(select 1 from public.listings l where l.seller_id=p.id and l.status='active')),'[]'::jsonb)
  );
$$;
revoke all on function public.sitemap_entries() from public;
grant execute on function public.sitemap_entries() to anon;

commit;
