begin;

-- The giveaway prize is not for sale, so it must never be offered to Google Merchant Center as a product with a price.
-- It is left out while its giveaway is running or drawn; if the giveaway is switched off (cancelled) it goes back into the feed like any other King's Collection item.
create or replace function public.merchant_feed_listings() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'price_cents',l.price_cents,'category',l.category,'weight_oz',l.weight_oz,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  )),'[]'::jsonb)
  from public.listings l
  where l.status='active' and exists(select 1 from public.operators op where op.user_id=l.seller_id)
    and not exists(select 1 from public.giveaways g where g.listing_id=l.id and g.status in ('active','drawn'));
$$;

commit;
