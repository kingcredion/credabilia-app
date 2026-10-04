begin;

-- The signature review now looks at real verified examples instead of comparing text descriptions. For the signer the seller
-- named, this returns how many operator-curated (verified) reference signatures exist and the storage paths of the newest few,
-- so analyze-signature can show those photos to the model. A listing's own photo is excluded so a promoted listing is never
-- compared with itself. Service role only: the edge function is the only caller, the table itself stays locked down.
create function public.signature_reference_images(p_subject text, p_exclude_listing uuid default null, p_limit integer default 3) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'total', (select count(*)::int from public.signature_references
               where provenance='operator_curated' and lower(btrim(subject_name))=lower(btrim(p_subject))
                 and source_listing_id is distinct from p_exclude_listing),
    'paths', coalesce((select jsonb_agg(t.media_path order by t.created_at desc) from (
               select media_path, created_at from public.signature_references
                where provenance='operator_curated' and lower(btrim(subject_name))=lower(btrim(p_subject))
                  and source_listing_id is distinct from p_exclude_listing
                order by created_at desc limit greatest(p_limit,0)) t), '[]'::jsonb));
$$;
revoke all on function public.signature_reference_images(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.signature_reference_images(text,uuid,integer) to service_role;

commit;
