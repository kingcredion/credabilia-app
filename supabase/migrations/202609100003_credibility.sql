begin;
-- Values mirror the original listing catalog. Tests require exact parity with src/certificates.js.
create function public.certificate_rating(p_issuer text) returns integer
language sql immutable set search_path='' as $$
select case p_issuer when 'psa' then 95 when 'jsa' then 92 when 'bas' then 93
when 'sgc' then 90 when 'cgc' then 91 when 'uda' then 88 when 'fanatics' then 87
when 'steiner' then 85 when 'tristar' then 84 when 'mlb' then 89
when 'credabilia' then 100 else 50 end;
$$;
revoke all on function public.certificate_rating(text) from public,anon,authenticated;

create or replace function public.browse_listings_with_certificates() returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,
    (l.certificate_issuer is not null and l.certificate_number is not null) as certificate_supplied,
    case when l.certificate_issuer is not null and l.certificate_number is not null
      then public.certificate_rating(l.certificate_issuer) else 50 end as certificate_score,
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
revoke all on function public.browse_listings_with_certificates() from public;
grant execute on function public.browse_listings_with_certificates() to anon,authenticated;
commit;
