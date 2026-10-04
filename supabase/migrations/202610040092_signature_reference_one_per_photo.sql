begin;

-- Each signature photo is one reference, once. capture_signature_reference ran on every create and every edit and inserted a new
-- row each time, so one photo could be counted as several "verified examples" (three Mike Tyson rows were one picture). The
-- duplicate rows were removed by hand first; this makes the table refuse them and the capture function idempotent.
create unique index signature_references_one_per_photo on public.signature_references(media_path);

-- Same function as 202609300054, but a repeat capture of the same photo is a no-op. If the signer's name was changed since the
-- photo was last captured, the row follows the new name and goes back to unverified: an operator verified it as the old name,
-- so it cannot silently count towards the new one until someone promotes it again.
create or replace function public.capture_signature_reference(p_listing_id uuid, p_subject text, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare sig_path text; clean_subject text; clean_note text;
begin
  clean_subject:=nullif(btrim(coalesce(p_subject,'')),'');
  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  if clean_subject is null or clean_note is null then return; end if;
  select path into sig_path from public.listing_media where listing_id=p_listing_id and kind='signature' limit 1;
  if sig_path is null then return; end if;
  insert into public.signature_references(subject_name,media_path,source_listing_id,description)
    values(clean_subject,sig_path,p_listing_id,clean_note)
  on conflict (media_path) do update
    set subject_name=excluded.subject_name, provenance='self_reported', promoted_by=null, embedding=null, description=excluded.description
    where lower(btrim(public.signature_references.subject_name))<>lower(btrim(excluded.subject_name));
end;$$;
revoke all on function public.capture_signature_reference(uuid,text,text) from public,anon,authenticated;

commit;
