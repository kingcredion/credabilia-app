begin;

-- Signature profiles: one row per person ("Mike Tyson"), so every signature of that person is filed under the same profile no matter how the
-- seller typed the name. Until now a reference only carried the typed text, and "Mike Tyson", "mike tyson" and "Michael Tyson" were three
-- different people to the library (and to the AI comparison). A profile has a proper name plus other spellings (aliases) it also answers to.
--
-- How a new signature is filed: the typed name is tidied (case, punctuation, accents) and matched against profile names and aliases. A match is
-- linked automatically. No match leaves the reference unlinked and the admin queue suggests the closest profiles; approving it links it to one of
-- them (and remembers the typed spelling as an alias for next time) or starts a new profile. Approval is still the trust gate: nothing is used
-- for comparisons until an operator approves it, and approval can mark it as backed by a third-party certificate, which the comparison prefers.

-- "Mike Tyson", "mike  tyson", "MIKE TYSON." and "Shaquille O'Neal" / "Shaquille ONeal" tidy to the same key. Suffixes (Jr, Sr, III) are kept
-- on purpose: Ken Griffey Jr. and Ken Griffey Sr. are different people.
create function public.normalize_person_name(p text) returns text
language sql immutable set search_path='' as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(translate(lower(coalesce(p,'')),'áàâäãåéèêëíìîïóòôöõúùûüñçš','aaaaaaeeeeiiiiooooouuuuncs'),'[''’`.]','','g'),
    '[^a-z0-9]+',' ','g')),'');
$$;
grant execute on function public.normalize_person_name(text) to anon, authenticated, service_role;

create table public.signature_subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text not null,
  aliases text[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index signature_subjects_normalized_name on public.signature_subjects(normalized_name);
alter table public.signature_subjects enable row level security;
revoke all on public.signature_subjects from public,anon,authenticated;

alter table public.signature_references
  add column subject_id uuid references public.signature_subjects(id) on delete set null,
  add column submitted_name text;
create index signature_references_subject_id on public.signature_references(subject_id, provenance);
-- 'authenticated' = approved by an operator AND backed by a third-party authentication certificate (PSA/DNA, JSA, Beckett...). The comparison
-- shows these first.
alter table public.signature_references drop constraint signature_references_provenance_check;
alter table public.signature_references add constraint signature_references_provenance_check check (provenance in ('self_reported','operator_curated','authenticated'));

-- The profile a typed name belongs to (by profile name or any alias), or null.
create function public.resolve_signature_subject(p_name text) returns uuid
language sql stable security definer set search_path='' as $$
  select s.id from public.signature_subjects s
  where public.normalize_person_name(p_name) is not null
    and (s.normalized_name=public.normalize_person_name(p_name)
         or exists(select 1 from unnest(s.aliases) a where public.normalize_person_name(a)=public.normalize_person_name(p_name)))
  order by (s.normalized_name=public.normalize_person_name(p_name)) desc, s.created_at limit 1;
$$;
revoke all on function public.resolve_signature_subject(text) from public,anon,authenticated;
grant execute on function public.resolve_signature_subject(text) to service_role;

-- The profile for a name, created if it does not exist yet.
create function public.ensure_signature_subject(p_name text, p_by uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'),''); sid uuid;
begin
  if clean is null or public.normalize_person_name(clean) is null then raise exception 'Enter a name of 1 to 120 characters.'; end if;
  if char_length(clean)>120 then raise exception 'Keep the name under 120 characters.'; end if;
  sid:=public.resolve_signature_subject(clean);
  if sid is not null then return sid; end if;
  insert into public.signature_subjects(name,normalized_name,created_by) values(clean,public.normalize_person_name(clean),p_by) returning id into sid;
  return sid;
end;$$;
revoke all on function public.ensure_signature_subject(text,uuid) from public,anon,authenticated;

-- Remember a spelling a seller used as another name for this profile, so the next one files itself. It never steals a spelling that already
-- belongs to a different profile.
create function public.learn_signature_alias(p_subject uuid, p_spelling text) returns void
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(p_spelling,'')),'\s+',' ','g'),''); owner uuid;
begin
  if clean is null or public.normalize_person_name(clean) is null or char_length(clean)>120 then return; end if;
  owner:=public.resolve_signature_subject(clean);
  if owner is not null then return; end if;
  update public.signature_subjects set aliases=aliases||clean where id=p_subject and coalesce(array_length(aliases,1),0)<30;
end;$$;
revoke all on function public.learn_signature_alias(uuid,text) from public,anon,authenticated;

-- Closest existing profiles for a name that matched none: same surname, or one name inside the other, nearest first.
create function public.suggest_signature_subjects(p_name text, p_limit integer default 4) returns jsonb
language sql stable security definer set search_path='' as $$
  with q as (
    select public.normalize_person_name(p_name) as n,
           split_part(public.normalize_person_name(p_name),' ',1) as first,
           (regexp_match(public.normalize_person_name(p_name),'(\S+)$'))[1] as last),
  hits as (
    select s.id, s.name,
      case when s.normalized_name like q.n||'%' or q.n like s.normalized_name||'%' then 0
           when left(split_part(s.normalized_name,' ',1),1)=left(q.first,1) then 1 else 2 end as rank
    from public.signature_subjects s, q
    where q.n is not null and (
      (regexp_match(s.normalized_name,'(\S+)$'))[1]=q.last
      or s.normalized_name like '%'||q.n||'%' or q.n like '%'||s.normalized_name||'%'
      or exists(select 1 from unnest(s.aliases) a where public.normalize_person_name(a) like '%'||q.n||'%'))
    order by 3, s.name limit greatest(p_limit,0))
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by rank, name),'[]'::jsonb) from hits;
$$;
revoke all on function public.suggest_signature_subjects(text,integer) from public,anon,authenticated;

-- Existing library: one profile per person already in it (the most common spelling becomes the profile name), every reference linked.
insert into public.signature_subjects(name,normalized_name)
select subject_name, nn from (
  select distinct on (nn) subject_name, nn from (
    select subject_name, public.normalize_person_name(subject_name) as nn, count(*) as c from public.signature_references group by 1,2) t
  where nn is not null order by nn, c desc, subject_name) u;
update public.signature_references set submitted_name=subject_name, subject_id=public.resolve_signature_subject(subject_name);
update public.signature_references r set subject_name=s.name from public.signature_subjects s where s.id=r.subject_id and r.subject_name<>s.name;

-- Capture (runs when a listing with a signature photo and a "signed by" name is created or edited): now also links the profile.
-- A repeat capture of the same photo is a no-op unless the typed name now means a different person, which sends it back to unverified.
create or replace function public.capture_signature_reference(p_listing_id uuid, p_subject text, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare sig_path text; clean_subject text; clean_note text; sid uuid;
begin
  clean_subject:=nullif(regexp_replace(btrim(coalesce(p_subject,'')),'\s+',' ','g'),'');
  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  if clean_subject is null or clean_note is null then return; end if;
  select path into sig_path from public.listing_media where listing_id=p_listing_id and kind='signature' limit 1;
  if sig_path is null then return; end if;
  sid:=public.resolve_signature_subject(clean_subject);
  insert into public.signature_references(subject_name,submitted_name,subject_id,media_path,source_listing_id,description)
    values(coalesce((select name from public.signature_subjects where id=sid),clean_subject),clean_subject,sid,sig_path,p_listing_id,clean_note)
  on conflict (media_path) do update
    set subject_name=excluded.subject_name, submitted_name=excluded.submitted_name, subject_id=excluded.subject_id,
        provenance='self_reported', promoted_by=null, embedding=null, description=excluded.description
    where public.normalize_person_name(coalesce(public.signature_references.submitted_name,public.signature_references.subject_name))
          is distinct from public.normalize_person_name(excluded.submitted_name);
end;$$;
revoke all on function public.capture_signature_reference(uuid,text,text) from public,anon,authenticated;

-- The admin queue: each reference with its profile (if linked), suggestions (if not), and the certificate details on the listing it came from.
create or replace function public.admin_list_signature_references(p_provenance text default 'self_reported') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_provenance not in ('self_reported','operator_curated','authenticated') then raise exception 'Invalid provenance.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',sr.id,'subject_name',sr.subject_name,'submitted_name',coalesce(sr.submitted_name,sr.subject_name),'subject_id',sr.subject_id,
    'path',sr.media_path,'kind','signature','description',sr.description,'provenance',sr.provenance,'has_embedding',sr.embedding is not null,
    'listing_id',sr.source_listing_id,'listing_title',l.title,'created_at',sr.created_at,
    'certificate',case when l.certificate_issuer is not null or l.certificate_number is not null
                    then jsonb_build_object('issuer',l.certificate_issuer,'number',l.certificate_number,'company',l.certificate_company) else null end,
    'suggestions',case when sr.subject_id is null then public.suggest_signature_subjects(sr.subject_name) else '[]'::jsonb end
  ) order by sr.created_at desc) from public.signature_references sr join public.listings l on l.id=sr.source_listing_id
  where case when p_provenance='self_reported' then sr.provenance='self_reported'
             when p_provenance='authenticated' then sr.provenance='authenticated'
             else sr.provenance in ('operator_curated','authenticated') end),'[]'::jsonb);
end;$$;

-- Approve a reference and file it under a profile: the one the operator picks, else the one for the name they typed (made if new), else the
-- one it already has. The seller's own spelling is remembered as another name for that profile. p_certificate_backed marks it as backed by a
-- third-party certificate.
drop function public.admin_promote_signature_reference(uuid,text);
create function public.admin_promote_signature_reference(p_id uuid, p_subject_name text default null, p_subject_id uuid default null, p_certificate_backed boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ref record; sid uuid; clean text:=nullif(regexp_replace(btrim(coalesce(p_subject_name,'')),'\s+',' ','g'),''); pname text; tier text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if clean is not null and char_length(clean)>120 then raise exception 'Keep the name under 120 characters.'; end if;
  select * into ref from public.signature_references where id=p_id for update;
  if not found then raise exception 'Reference not found.'; end if;
  if p_subject_id is not null then
    select id into sid from public.signature_subjects where id=p_subject_id;
    if sid is null then raise exception 'Profile not found.'; end if;
  elsif clean is not null then sid:=public.ensure_signature_subject(clean,auth.uid());
  else sid:=coalesce(ref.subject_id,public.ensure_signature_subject(ref.subject_name,auth.uid())); end if;
  perform public.learn_signature_alias(sid,coalesce(ref.submitted_name,ref.subject_name));
  select name into pname from public.signature_subjects where id=sid;
  tier:=case when coalesce(p_certificate_backed,false) then 'authenticated' else 'operator_curated' end;
  update public.signature_references set subject_id=sid,subject_name=pname,provenance=tier,promoted_by=auth.uid() where id=p_id;
  return jsonb_build_object('id',p_id,'provenance',tier,'subject_name',pname,'subject_id',sid);
end;$$;
revoke all on function public.admin_promote_signature_reference(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.admin_promote_signature_reference(uuid,text,uuid,boolean) to authenticated;

-- Rename = file this entry under the profile for the new name (made if new). Move = file it under a profile the operator picks.
create or replace function public.admin_rename_signature_reference(p_id uuid, p_subject_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(p_subject_name,'')),'\s+',' ','g'),''); sid uuid; pname text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if clean is null or char_length(clean)>120 or public.normalize_person_name(clean) is null then raise exception 'Enter a name of 1 to 120 characters.'; end if;
  if not exists(select 1 from public.signature_references where id=p_id) then raise exception 'Reference not found.'; end if;
  sid:=public.ensure_signature_subject(clean,auth.uid());
  select name into pname from public.signature_subjects where id=sid;
  update public.signature_references set subject_id=sid,subject_name=pname where id=p_id;
  return jsonb_build_object('id',p_id,'subject_name',pname,'subject_id',sid);
end;$$;
revoke all on function public.admin_rename_signature_reference(uuid,text) from public,anon;
grant execute on function public.admin_rename_signature_reference(uuid,text) to authenticated;

create function public.admin_assign_signature_reference(p_id uuid, p_subject_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pname text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  select name into pname from public.signature_subjects where id=p_subject_id;
  if pname is null then raise exception 'Profile not found.'; end if;
  update public.signature_references set subject_id=p_subject_id,subject_name=pname where id=p_id;
  if not found then raise exception 'Reference not found.'; end if;
  return jsonb_build_object('id',p_id,'subject_name',pname,'subject_id',p_subject_id);
end;$$;
revoke all on function public.admin_assign_signature_reference(uuid,uuid) from public,anon;
grant execute on function public.admin_assign_signature_reference(uuid,uuid) to authenticated;

-- The profiles themselves: counts by trust level, other names, and the tools to tidy them.
create function public.admin_list_signature_subjects() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'aliases',s.aliases,
    'authenticated',(select count(*) from public.signature_references r where r.subject_id=s.id and r.provenance='authenticated'),
    'curated',(select count(*) from public.signature_references r where r.subject_id=s.id and r.provenance='operator_curated'),
    'pending',(select count(*) from public.signature_references r where r.subject_id=s.id and r.provenance='self_reported')) order by s.name) from public.signature_subjects s),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_signature_subjects() from public,anon;
grant execute on function public.admin_list_signature_subjects() to authenticated;

create function public.admin_rename_signature_subject(p_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=nullif(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'),'');
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if clean is null or char_length(clean)>120 or public.normalize_person_name(clean) is null then raise exception 'Enter a name of 1 to 120 characters.'; end if;
  if exists(select 1 from public.signature_subjects where id<>p_id and (normalized_name=public.normalize_person_name(clean)
       or exists(select 1 from unnest(aliases) a where public.normalize_person_name(a)=public.normalize_person_name(clean)))) then
    raise exception 'Another profile already uses that name. Merge the two profiles instead.';
  end if;
  update public.signature_subjects set name=clean,normalized_name=public.normalize_person_name(clean) where id=p_id;
  if not found then raise exception 'Profile not found.'; end if;
  update public.signature_references set subject_name=clean where subject_id=p_id;
  return jsonb_build_object('id',p_id,'name',clean);
end;$$;
revoke all on function public.admin_rename_signature_subject(uuid,text) from public,anon;
grant execute on function public.admin_rename_signature_subject(uuid,text) to authenticated;

-- Two profiles turn out to be the same person: everything moves into one, and the other's name and aliases become aliases of it.
create function public.admin_merge_signature_subjects(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare gone record; keep record; moved integer;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_from=p_into then raise exception 'Choose two different profiles.'; end if;
  select * into gone from public.signature_subjects where id=p_from for update;
  select * into keep from public.signature_subjects where id=p_into for update;
  if gone.id is null or keep.id is null then raise exception 'Profile not found.'; end if;
  update public.signature_references set subject_id=p_into,subject_name=keep.name where subject_id=p_from;
  get diagnostics moved=row_count;
  delete from public.signature_subjects where id=p_from;
  update public.signature_subjects set aliases=(select coalesce(array_agg(distinct a),'{}') from unnest(keep.aliases||gone.aliases||gone.name) a
      where public.normalize_person_name(a)<>keep.normalized_name) where id=p_into;
  return jsonb_build_object('into',p_into,'moved',moved);
end;$$;
revoke all on function public.admin_merge_signature_subjects(uuid,uuid) from public,anon;
grant execute on function public.admin_merge_signature_subjects(uuid,uuid) to authenticated;

create function public.admin_remove_signature_alias(p_id uuid, p_alias text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.signature_subjects set aliases=array_remove(aliases,p_alias) where id=p_id;
  if not found then raise exception 'Profile not found.'; end if;
end;$$;
revoke all on function public.admin_remove_signature_alias(uuid,text) from public,anon;
grant execute on function public.admin_remove_signature_alias(uuid,text) to authenticated;

-- "Signed by" suggestions for sellers as they type, so most listings pick an existing profile instead of inventing a new spelling. Names only.
create function public.search_signature_subjects(p_query text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n text:=public.normalize_person_name(p_query);
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if n is null or char_length(n)<2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(t.name order by t.rank, t.name) from (
    select s.name, case when s.normalized_name like n||'%' then 0 else 1 end as rank from public.signature_subjects s
    where s.normalized_name like '%'||n||'%' or exists(select 1 from unnest(s.aliases) a where public.normalize_person_name(a) like n||'%')
    order by 2, 1 limit 8) t),'[]'::jsonb);
end;$$;
revoke all on function public.search_signature_subjects(text) from public,anon;
grant execute on function public.search_signature_subjects(text) to authenticated;

-- The AI comparison now finds the signer's verified photos through the profile (so "Michael Tyson" and "Mike Tyson" share one set), puts
-- certificate-backed ones first, then the newest, and reports the profile's proper name. A name with no profile still matches by its text.
create or replace function public.signature_reference_images(p_subject text, p_exclude_listing uuid default null, p_limit integer default 3) returns jsonb
language sql stable security definer set search_path='' as $$
  with sid as (select public.resolve_signature_subject(p_subject) as id),
  usable as (
    select r.media_path, r.created_at, r.provenance from public.signature_references r, sid
    where r.provenance in ('operator_curated','authenticated') and r.source_listing_id is distinct from p_exclude_listing
      and ((sid.id is not null and r.subject_id=sid.id) or (sid.id is null and lower(btrim(r.subject_name))=lower(btrim(p_subject)))))
  select jsonb_build_object(
    'total',(select count(*)::int from usable),
    'name',(select s.name from public.signature_subjects s, sid where s.id=sid.id),
    'paths',coalesce((select jsonb_agg(t.media_path order by (t.provenance='authenticated') desc, t.created_at desc)
      from (select * from usable order by (provenance='authenticated') desc, created_at desc limit greatest(p_limit,0)) t),'[]'::jsonb));
$$;

commit;
