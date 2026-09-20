begin;

-- 202609300027_credibility_low_default.sql intended to update the inner scoring function
-- (browse_scored_listings, renamed from browse_listings_with_certificates back in
-- 202609100004_media.sql) but recreated it under the OUTER wrapper's name instead. That clobbered
-- the wrapper chain (browse_listings_with_media -> +attributes/tags -> +seller_charges_enabled),
-- silently dropping media/attributes/tags/seller_charges_enabled from every listing everywhere in
-- the app. This restores the wrapper and puts the corrected scoring formula (absent certificate
-- scores 25, not a neutral 50) on the actual scoring function.

create or replace function public.browse_scored_listings() returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,
    (l.certificate_issuer is not null and l.certificate_number is not null) as certificate_supplied,
    case when l.certificate_issuer is not null and l.certificate_number is not null
      then public.certificate_rating(l.certificate_issuer) else 25 end as certificate_score,
    round((250+coalesce((select sum(case a.verdict when 'authentic' then 100 when 'uncertain' then 50 else 0 end)
      from public.audits a where a.listing_id=b.id),0))::numeric/(5+b.audit_count))::integer as community_score,
    case when b.audit_count<10 then 80 when b.audit_count<25 then 65 when b.audit_count<100 then 50 else 35 end as certificate_weight
  from public.browse_listings() b join public.listings l on l.id=b.id
)
select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
  'community_weight',100-s.certificate_weight,'credibility_audit_count',s.audit_count,
  'credibility_score',round((s.certificate_score*s.certificate_weight+s.community_score*(100-s.certificate_weight))::numeric/100)::integer
) order by s.created_at desc,s.id),'[]'::jsonb) from scored s;
$$;

create or replace function public.browse_listings_with_certificates() returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object('attributes',l.attributes,'tags',l.tags,'seller_charges_enabled',coalesce(sa.charges_enabled,false)) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_listings_with_media()) with ordinality as items(item,position)
join public.listings l on l.id=(item->>'id')::uuid
left join public.stripe_accounts sa on sa.user_id=l.seller_id;
$$;

commit;
