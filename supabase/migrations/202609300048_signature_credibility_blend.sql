begin;

-- Folds the signature AI opinion into the existing certificate_score term as a small, capped
-- modifier -- deliberately conservative (an "opinion" shouldn't swing the score the way a real
-- audit or certificate does): consistent +5, inconclusive +0, concerns -15, no signature
-- submitted at all (the common case today) leaves certificate_score byte-identical to before this
-- migration. Same body as 202609300031_fix_browse_listings_media_regression.sql otherwise --
-- selecting l.signature_ai_label/l.signature_ai_note through so the client can display them.
create or replace function public.browse_scored_listings() returns jsonb
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
  from public.browse_listings() b join public.listings l on l.id=b.id
)
select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
  'community_weight',100-s.certificate_weight,'credibility_audit_count',s.audit_count,
  'credibility_score',round((s.certificate_score*s.certificate_weight+s.community_score*(100-s.certificate_weight))::numeric/100)::integer
) order by s.created_at desc,s.id),'[]'::jsonb) from scored s;
$$;

commit;
