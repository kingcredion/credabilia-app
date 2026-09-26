begin;

-- browse_listings() had a hardcoded `limit 100` with no way to reach anything older -- once the
-- catalog passed 100 active listings, older items would silently vanish from Discover, from a
-- seller's own "Sell" dashboard, and from the Audit queue, all of which derive from this same feed.
-- This adds real cursor pagination (p_after_created_at/p_after_id, matching the existing
-- `order by created_at desc, id` sort) and raises the per-call ceiling to 300 -- comfortably above
-- today's catalog size, with "Load more" (wired up in the client) able to page past it indefinitely.
-- Threaded straight through the existing browse_listings -> browse_scored_listings ->
-- browse_listings_with_media -> browse_listings_with_certificates chain (each layer is a thin
-- jsonb_agg pass-through, so only browse_listings() needs real filter/sort/limit logic).
drop function public.browse_listings();
create function public.browse_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table(id uuid,seller_id uuid,seller_name text,title text,description text,evidence text,category text,price_cents bigint,status text,created_at timestamptz,audit_count bigint,version integer,listing_type text,auction_ends_at timestamptz,bid_count integer)
language sql stable security definer set search_path = '' as $$
  select l.id,l.seller_id,p.display_name,l.title,l.description,l.evidence,l.category,l.price_cents,l.status,l.created_at,
    (select count(*) from public.audits a where a.listing_id = l.id and a.listing_version = l.version),
    l.version,l.listing_type,l.auction_ends_at,l.bid_count
  from public.listings l join public.profiles p on p.id = l.seller_id
  where l.status = 'active'
    and (p_after_created_at is null or (l.created_at,l.id) < (p_after_created_at,p_after_id))
  order by l.created_at desc, l.id desc
  limit least(coalesce(p_limit,300),300);
$$;
revoke all on function public.browse_listings(integer,timestamptz,uuid) from public;
grant execute on function public.browse_listings(integer,timestamptz,uuid) to anon, authenticated;

-- Same body as 202609300048_signature_credibility_blend.sql, just threading the cursor/limit
-- params through to browse_listings() and matching its id-desc tiebreak so pagination is stable.
drop function public.browse_scored_listings();
create function public.browse_scored_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,l.signature_ai_label,l.signature_ai_note,
    (l.certificate_issuer is not null and l.certificate_number is not null) as certificate_supplied,
    greatest(0,least(100,
      (case when l.certificate_issuer is not null and l.certificate_number is not null
        then public.certificate_rating(l.certificate_issuer) else 25 end)
      + (case l.signature_ai_label when 'consistent' then 5 when 'concerns' then -15 else 0 end)
    )) as certificate_score,
    round((250+coalesce((select sum(case a.verdict when 'authentic' then 100 when 'uncertain' then 50 else 0 end)
      from public.audits a where a.listing_id=b.id),0))::numeric/(5+b.audit_count))::integer as community_score,
    case when b.audit_count<10 then 80 when b.audit_count<25 then 65 when b.audit_count<100 then 50 else 35 end as certificate_weight
  from public.browse_listings(p_limit,p_after_created_at,p_after_id) b join public.listings l on l.id=b.id
)
select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
  'community_weight',100-s.certificate_weight,'credibility_audit_count',s.audit_count,
  'credibility_score',round((s.certificate_score*s.certificate_weight+s.community_score*(100-s.certificate_weight))::numeric/100)::integer
) order by s.created_at desc,s.id desc),'[]'::jsonb) from scored s;
$$;
revoke all on function public.browse_scored_listings(integer,timestamptz,uuid) from public;
grant execute on function public.browse_scored_listings(integer,timestamptz,uuid) to anon,authenticated;

drop function public.browse_listings_with_media();
create function public.browse_listings_with_media(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object('media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=(item->>'id')::uuid),'[]'::jsonb)) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_scored_listings(p_limit,p_after_created_at,p_after_id)) with ordinality as items(item,position)
$$;
revoke all on function public.browse_listings_with_media(integer,timestamptz,uuid) from public;
grant execute on function public.browse_listings_with_media(integer,timestamptz,uuid) to anon,authenticated;

drop function public.browse_listings_with_certificates();
create function public.browse_listings_with_certificates(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object(
  'attributes',l.attributes,'tags',l.tags,'seller_charges_enabled',coalesce(sa.charges_enabled,false),
  'seller_member_since',p.created_at,
  'seller_sales_count',(select count(*) from public.purchases where seller_id=l.seller_id),
  'seller_rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=l.seller_id),
  'seller_rating_count',(select count(*) from public.seller_ratings where seller_id=l.seller_id),
  'pickup_enabled',l.pickup_enabled,
  'pickup_station',case when l.pickup_enabled then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end
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
