begin;

-- When the AI or the seller misnames who a signature belongs to, the operator can correct the name while approving it, so the reference is
-- filed under the right person. A name can also be corrected later on an entry that is already in the curated library.
drop function public.admin_promote_signature_reference(uuid);
create function public.admin_promote_signature_reference(p_id uuid, p_subject_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(p_subject_name,'')),'\s+',' ','g'),'');
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if clean is not null and char_length(clean)>120 then raise exception 'Keep the name under 120 characters.'; end if;
  update public.signature_references set provenance='operator_curated', promoted_by=auth.uid(), subject_name=coalesce(clean,subject_name) where id=p_id;
  if not found then raise exception 'Reference not found.'; end if;
  return jsonb_build_object('id',p_id,'provenance','operator_curated','subject_name',(select subject_name from public.signature_references where id=p_id));
end;$$;
revoke all on function public.admin_promote_signature_reference(uuid,text) from public,anon;
grant execute on function public.admin_promote_signature_reference(uuid,text) to authenticated;

create function public.admin_rename_signature_reference(p_id uuid, p_subject_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(p_subject_name,'')),'\s+',' ','g'),'');
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if clean is null or char_length(clean)>120 then raise exception 'Enter a name of 1 to 120 characters.'; end if;
  update public.signature_references set subject_name=clean where id=p_id;
  if not found then raise exception 'Reference not found.'; end if;
  return jsonb_build_object('id',p_id,'subject_name',clean);
end;$$;
revoke all on function public.admin_rename_signature_reference(uuid,text) from public,anon;
grant execute on function public.admin_rename_signature_reference(uuid,text) to authenticated;

commit;
