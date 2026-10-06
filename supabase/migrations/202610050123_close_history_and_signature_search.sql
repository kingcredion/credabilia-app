begin;

-- get_listing_history could be called by anyone, signed in or not, for ANY listing id, and returned its earlier versions (description, certificate
-- details, audits) even for removed (archived), draft or under-review listings. It now answers only for listings that are visible to the public
-- (active, pending, sold) or that belong to the caller.
create or replace function public.get_listing_history(p_listing_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version',r.version,'title',r.title,'description',r.description,'category',r.category,'evidence',r.evidence,
    'certificate_issuer',r.certificate_issuer,'certificate_number',r.certificate_number,'certificate_company',r.certificate_company,
    'attributes',r.attributes,'tags',r.tags,'media',r.media,'archived_at',r.archived_at,
    'audits',coalesce((select jsonb_agg(jsonb_build_object('verdict',a.verdict,'explanation',a.explanation,'created_at',a.created_at) order by a.created_at)
      from public.audits a where a.listing_id=p_listing_id and a.listing_version=r.version),'[]'::jsonb)
  ) order by r.version desc),'[]'::jsonb)
  from public.listing_revisions r
  where r.listing_id=p_listing_id
    and exists(select 1 from public.listings l where l.id=p_listing_id and (l.status in ('active','pending','sold') or l.seller_id=auth.uid()));
$$;

-- Nothing in the app calls this; it compares a signature against the curated reference library and belongs to the server only.
revoke all on function public.search_signature_references(text,text,integer) from public,anon,authenticated;
grant execute on function public.search_signature_references(text,text,integer) to service_role;

commit;
