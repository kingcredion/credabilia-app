begin;

-- 1. A listing with a signature photo must say who signed it. The "signed by" box was optional, so 14 of the 23 signature photos had no name and
-- could never join the signature library. The rule is checked when the listing is saved (deferred to the end of the save, so the photo and the
-- name can be written in any order inside it), whichever way the listing is created or edited. Listings that already have a signature photo and
-- no name are not touched until someone edits them; the edit then needs a name.
create function public.check_signed_listing_has_signer() returns trigger
language plpgsql security definer set search_path='' as $$
declare lid uuid;
begin
  if tg_table_name='listings' then lid:=new.id; else lid:=new.listing_id; end if;
  if exists(select 1 from public.listing_media m where m.listing_id=lid and m.kind='signature')
     and nullif(btrim(coalesce((select l.attributes->>'subject' from public.listings l where l.id=lid),'')),'') is null then
    raise exception 'Enter who signed it. A name is needed for every signed item.';
  end if;
  return null;
end;$$;
revoke all on function public.check_signed_listing_has_signer() from public,anon,authenticated;

create constraint trigger signed_listing_needs_signer_media after insert or update on public.listing_media
  deferrable initially deferred for each row when (new.kind='signature') execute function public.check_signed_listing_has_signer();
create constraint trigger signed_listing_needs_signer_listing after update of attributes on public.listings
  deferrable initially deferred for each row execute function public.check_signed_listing_has_signer();

-- 2. Suggested merges: two profiles that are probably the same person. Same surname with the same first name or a nickname/short form
-- (Mike/Michael, Pete/Peter), one name's words all inside the other's, or a one-word name that appears in the other. Jr and Sr never match
-- each other: Ken Griffey Jr. and Ken Griffey Sr. are different people.
create function public.canonical_first_name(p text) returns text
language sql immutable set search_path='' as $$
  select coalesce((select v.full_name from (values
    ('mike','michael'),('mick','michael'),('mikey','michael'),('bob','robert'),('rob','robert'),('bobby','robert'),('bill','william'),('billy','william'),('will','william'),
    ('jim','james'),('jimmy','james'),('tom','thomas'),('tommy','thomas'),('dick','richard'),('rick','richard'),('rich','richard'),('joe','joseph'),('joey','joseph'),
    ('chuck','charles'),('charlie','charles'),('ted','edward'),('ed','edward'),('eddie','edward'),('dave','david'),('steve','stephen'),('steven','stephen'),
    ('tony','anthony'),('nick','nicholas'),('chris','christopher'),('dan','daniel'),('danny','daniel'),('matt','matthew'),('ben','benjamin'),('sam','samuel'),
    ('alex','alexander'),('andy','andrew'),('drew','andrew'),('jon','jonathan'),('ken','kenneth'),('kenny','kenneth'),('ron','ronald'),('don','donald'),('larry','lawrence'),
    ('pat','patrick'),('greg','gregory'),('jerry','gerald'),('pete','peter'),('shaq','shaquille'),('jeff','jeffrey'),('josh','joshua'),('zach','zachary'),('tim','timothy'),
    ('ray','raymond'),('walt','walter'),('hank','henry'),('jack','john'),('johnny','john'),('liz','elizabeth'),('beth','elizabeth'),('kate','katherine'),('kathy','katherine'),
    ('sue','susan'),('jen','jennifer'),('jenny','jennifer'),('becky','rebecca'),('vicky','victoria')) as v(nick,full_name) where v.nick=p), p);
$$;

create function public.signature_names_may_match(a text, b text) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  ta text[]; tb text[]; suffixes text[]:=array['jr','sr','ii','iii','iv'];
  ssa text:=''; ssb text:=''; fa text; fb text; sa text; sb text;
begin
  if a is null or b is null or a='' or b='' or a=b then return false; end if;
  ta:=regexp_split_to_array(a,' '); tb:=regexp_split_to_array(b,' ');
  if array_length(ta,1)>1 and ta[array_length(ta,1)]=any(suffixes) then ssa:=ta[array_length(ta,1)]; ta:=ta[1:array_length(ta,1)-1]; end if;
  if array_length(tb,1)>1 and tb[array_length(tb,1)]=any(suffixes) then ssb:=tb[array_length(tb,1)]; tb:=tb[1:array_length(tb,1)-1]; end if;
  if ssa<>'' and ssb<>'' and ssa<>ssb then return false; end if;
  fa:=public.canonical_first_name(ta[1]); fb:=public.canonical_first_name(tb[1]);
  sa:=ta[array_length(ta,1)]; sb:=tb[array_length(tb,1)];
  if array_length(ta,1)>1 and array_length(tb,1)>1 and sa=sb and (fa=fb or left(fa,length(fb))=fb or left(fb,length(fa))=fa) then return true; end if;
  if array_length(ta,1)>=2 and array_length(tb,1)>=2 and (ta<@tb or tb<@ta) then return true; end if;
  if array_length(ta,1)=1 and (ta[1]=any(tb) or fa=fb) then return true; end if;
  if array_length(tb,1)=1 and (tb[1]=any(ta) or fb=fa) then return true; end if;
  return false;
end;$$;

-- The profiles list now carries, for each profile, the other profiles it may be a duplicate of.
create or replace function public.admin_list_signature_subjects() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'aliases',s.aliases,
    'authenticated',(select count(*) from public.signature_references r where r.subject_id=s.id and r.provenance='authenticated'),
    'curated',(select count(*) from public.signature_references r where r.subject_id=s.id and r.provenance='operator_curated'),
    'pending',(select count(*) from public.signature_references r where r.subject_id=s.id and r.provenance='self_reported'),
    'merge_suggestions',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
        'signatures',(select count(*) from public.signature_references r where r.subject_id=o.id)) order by o.name),'[]'::jsonb)
      from public.signature_subjects o where o.id<>s.id and (public.signature_names_may_match(s.normalized_name,o.normalized_name)
        or exists(select 1 from unnest(s.aliases) a where public.normalize_person_name(a)=o.normalized_name)
        or exists(select 1 from unnest(o.aliases) a where public.normalize_person_name(a)=s.normalized_name)))
  ) order by s.name) from public.signature_subjects s),'[]'::jsonb);
end;$$;

commit;
