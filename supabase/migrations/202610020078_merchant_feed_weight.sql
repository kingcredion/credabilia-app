begin;

-- merchant_feed_listings() gains weight_oz -- Google Merchant Center flagged all 4 live products
-- with "Missing shipping weight [shipping_weight]" after the feed went live. weight_oz is already
-- required and always set at creation (create_listing_with_details rejects a null/zero value), so
-- this is just surfacing data that already exists, not collecting anything new.
create or replace function public.merchant_feed_listings() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'price_cents',l.price_cents,'category',l.category,'weight_oz',l.weight_oz,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  )),'[]'::jsonb)
  from public.listings l where l.status='active';
$$;

commit;
