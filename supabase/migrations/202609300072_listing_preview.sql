-- Minimal public lookup for a single active listing, used by the Vercel routing middleware to
-- build real per-item link-share previews (og:title/description/image) instead of the generic
-- site-wide card every /item/:id link showed before. Mirrors get_storefront()'s shape/style --
-- a single security-definer RPC rather than reusing browse_listings_with_certificates(), since
-- that would mean fetching/filtering the entire active catalog just to render one link preview.
-- Returns null for anything not active (sold/needs_review/held/nonexistent), same visibility
-- rule browse_listings() already enforces -- a link to an unpublished listing just falls back
-- to the generic Credabilia card rather than leaking any detail about it.
create function public.get_listing_preview(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'price_cents',l.price_cents,'category',l.category,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  )
  from public.listings l where l.id=p_id and l.status='active';
$$;
revoke all on function public.get_listing_preview(uuid) from public;
grant execute on function public.get_listing_preview(uuid) to anon,authenticated;
