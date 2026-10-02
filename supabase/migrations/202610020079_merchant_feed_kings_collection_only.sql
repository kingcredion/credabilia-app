begin;

-- Scope the Merchant Center feed to King's Collection (operator-listed) items only. A third-party
-- seller's shipping delays, inaccurate listings, or cancellations would hit Credabilia's single
-- shared Merchant Center account standing, not just that seller's own reputation on the
-- marketplace -- real exposure for an account with zero track record. King's Collection already
-- carries the matching trust model (zero-handshake instant buy), so it's the inventory that
-- belongs in a surface branded as "Credabilia." Revisit once third-party sellers have a track
-- record worth trusting (e.g. a seller-rating/completed-sales threshold).
create or replace function public.merchant_feed_listings() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'price_cents',l.price_cents,'category',l.category,'weight_oz',l.weight_oz,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  )),'[]'::jsonb)
  from public.listings l
  where l.status='active' and exists(select 1 from public.operators op where op.user_id=l.seller_id);
$$;

commit;
