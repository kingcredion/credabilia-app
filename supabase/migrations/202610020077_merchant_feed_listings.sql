begin;

-- Backs a Google Merchant Center product feed (/products.xml, served by middleware.js). Same
-- field shape as get_listing_preview() (202609300072_listing_preview.sql), just for every active
-- listing at once instead of a single id, so the feed builder doesn't make one Supabase round
-- trip per item.
create function public.merchant_feed_listings() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'price_cents',l.price_cents,'category',l.category,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  )),'[]'::jsonb)
  from public.listings l where l.status='active';
$$;
revoke all on function public.merchant_feed_listings() from public;
grant execute on function public.merchant_feed_listings() to anon;

commit;
