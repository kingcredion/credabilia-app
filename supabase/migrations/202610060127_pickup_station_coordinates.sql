begin;

-- Map positions for the safe-exchange stations, so listings that offer local pickup can be found by distance ("Items near me").
-- lat/lng come from OpenStreetMap, not from Google (Google's terms do not allow storing its coordinates long-term). geo_precision says how good the
-- position is: 'station' = the station itself, 'city' = the middle of its city (good enough to sort by distance, not to navigate to).
alter table public.pickup_stations
  add column lat double precision,
  add column lng double precision,
  add column geo_precision text check (geo_precision in ('station','city')),
  add constraint pickup_stations_lat_lng_valid check ((lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180));

-- The browse results already carry each listing's pickup station; they now carry its position too.
create or replace function public.browse_listings_with_certificates(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object(
  'attributes',l.attributes,'tags',l.tags,'seller_charges_enabled',coalesce(sa.charges_enabled,false),
  'seller_member_since',p.created_at,
  'seller_sales_count',(select count(*) from public.purchases where seller_id=l.seller_id),
  'seller_rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=l.seller_id),
  'seller_rating_count',(select count(*) from public.seller_ratings where seller_id=l.seller_id),
  'pickup_enabled',l.pickup_enabled,
  'pickup_station',case when l.pickup_enabled then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes,'lat',ps.lat,'lng',ps.lng,'geo_precision',ps.geo_precision) else null end,
  'king_collection',exists(select 1 from public.operators op where op.user_id=l.seller_id)
) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_listings_with_media(p_limit,p_after_created_at,p_after_id)) with ordinality as items(item,position)
join public.listings l on l.id=(item->>'id')::uuid
join public.profiles p on p.id=l.seller_id
left join public.stripe_accounts sa on sa.user_id=l.seller_id
left join public.pickup_stations ps on ps.id=l.pickup_station_id;
$$;
revoke all on function public.browse_listings_with_certificates(integer,timestamptz,uuid) from public;
grant execute on function public.browse_listings_with_certificates(integer,timestamptz,uuid) to anon,authenticated;

commit;
