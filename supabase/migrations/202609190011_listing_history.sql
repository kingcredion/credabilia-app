begin;

alter table public.listings add column version integer not null default 1;
alter table public.audits add column listing_version integer not null default 1;
alter table public.audits drop constraint audits_listing_id_auditor_id_key;
alter table public.audits add constraint audits_listing_id_listing_version_auditor_id_key unique(listing_id,listing_version,auditor_id);

create table public.listing_revisions(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  version integer not null,
  title text not null,
  description text not null,
  category text not null,
  evidence text not null default '',
  certificate_issuer text,
  certificate_number text,
  certificate_company text,
  attributes jsonb not null default '{}',
  tags jsonb not null default '[]',
  media jsonb not null default '[]',
  archived_at timestamptz not null default now()
);
create index listing_revisions_listing on public.listing_revisions(listing_id);
alter table public.listing_revisions enable row level security;
revoke all on public.listing_revisions from public,anon,authenticated;

create function public.get_listing_history(p_listing_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version',r.version,'title',r.title,'description',r.description,'category',r.category,'evidence',r.evidence,
    'certificate_issuer',r.certificate_issuer,'certificate_number',r.certificate_number,'certificate_company',r.certificate_company,
    'attributes',r.attributes,'tags',r.tags,'media',r.media,'archived_at',r.archived_at,
    'audits',coalesce((select jsonb_agg(jsonb_build_object('verdict',a.verdict,'explanation',a.explanation,'created_at',a.created_at) order by a.created_at)
      from public.audits a where a.listing_id=p_listing_id and a.listing_version=r.version),'[]'::jsonb)
  ) order by r.version desc),'[]'::jsonb)
  from public.listing_revisions r where r.listing_id=p_listing_id;
$$;
revoke all on function public.get_listing_history(uuid) from public;
grant execute on function public.get_listing_history(uuid) to anon,authenticated;

drop function public.browse_listings();
create function public.browse_listings()
returns table(id uuid,seller_id uuid,seller_name text,title text,description text,evidence text,category text,price_cents bigint,status text,created_at timestamptz,audit_count bigint,version integer)
language sql stable security definer set search_path = '' as $$
  select l.id,l.seller_id,p.display_name,l.title,l.description,l.evidence,l.category,l.price_cents,l.status,l.created_at,
    (select count(*) from public.audits a where a.listing_id = l.id and a.listing_version = l.version),
    l.version
  from public.listings l join public.profiles p on p.id = l.seller_id
  where l.status = 'active'
  order by l.created_at desc, l.id limit 100;
$$;
revoke all on function public.browse_listings() from public;
grant execute on function public.browse_listings() to anon, authenticated;

create or replace function public.browse_scored_listings() returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,
    (l.certificate_issuer is not null and l.certificate_number is not null) as certificate_supplied,
    case when l.certificate_issuer is not null and l.certificate_number is not null
      then public.certificate_rating(l.certificate_issuer) else 50 end as certificate_score,
    round((250+coalesce((select sum(case a.verdict when 'authentic' then 100 when 'uncertain' then 50 else 0 end)
      from public.audits a where a.listing_id=b.id and a.listing_version=l.version),0))::numeric/(5+b.audit_count))::integer as community_score,
    case when b.audit_count<10 then 80 when b.audit_count<25 then 65 when b.audit_count<100 then 50 else 35 end as certificate_weight
  from public.browse_listings() b join public.listings l on l.id=b.id
)
select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
  'community_weight',100-s.certificate_weight,'credibility_audit_count',s.audit_count,
  'credibility_score',round((s.certificate_score*s.certificate_weight+s.community_score*(100-s.certificate_weight))::numeric/100)::integer
) order by s.created_at desc,s.id),'[]'::jsonb) from scored s;
$$;
revoke all on function public.browse_scored_listings() from public;
grant execute on function public.browse_scored_listings() to anon,authenticated;

create or replace function public.submit_audit(p_listing_id uuid, p_verdict text, p_explanation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); item public.listings; new_id uuid; permitted boolean;
begin
  if actor is null then raise exception 'Sign in to submit an audit' using errcode = '42501'; end if;
  select can_audit into permitted from public.account_permissions where user_id = actor for share;
  if permitted is distinct from true then raise exception 'Auditing permission required' using errcode = '42501'; end if;
  select * into item from public.listings where id = p_listing_id for share;
  if not found or item.status <> 'active' then raise exception 'Listing is not available for audit'; end if;
  if item.seller_id = actor then raise exception 'You cannot audit your own listing' using errcode = '42501'; end if;
  insert into public.audits(listing_id,auditor_id,verdict,explanation,listing_version)
    values (p_listing_id,actor,p_verdict,btrim(p_explanation),item.version)
    on conflict (listing_id,listing_version,auditor_id) do nothing returning id into new_id;
  if new_id is null then return jsonb_build_object('xp_earned',0,'already_submitted',true); end if;
  insert into public.reward_events(user_id,audit_id,xp) values (actor,new_id,5);
  update public.user_progress set xp = xp + 5 where user_id = actor;
  if not found then raise exception 'Account progress missing'; end if;
  return jsonb_build_object('xp_earned',5,'already_submitted',false);
end;
$$;
revoke all on function public.submit_audit(uuid,text,text) from public, anon;
grant execute on function public.submit_audit(uuid,text,text) to authenticated;

drop function public.edit_listing(uuid,text,text,text,bigint,text,jsonb);
create function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item public.listings; permitted boolean; actor uuid:=auth.uid();
  new_issuer text:=nullif(btrim(p_issuer),''); new_number text:=nullif(btrim(p_number),''); new_company text:=nullif(btrim(p_company),'');
  substantive boolean; asset jsonb; ordinal integer:=0;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select can_sell into permitted from public.account_permissions where user_id=actor for share;
 if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
 select * into item from public.listings where id=p_id for update;
 if not found or item.seller_id<>actor then raise exception 'You can only edit your own listing' using errcode='42501'; end if;
 if item.status<>'active' then raise exception 'Only active listings can be edited'; end if;
 if p_expected is distinct from jsonb_build_object('title',item.title,'description',item.description,'category',item.category,'price_cents',item.price_cents,'evidence',item.evidence) then raise exception 'This listing changed. Reopen it before editing.'; end if;

 substantive := (btrim(p_title),btrim(p_description),p_category,btrim(coalesce(p_evidence,'')),new_issuer,new_number,new_company)
   is distinct from (item.title,item.description,item.category,item.evidence,item.certificate_issuer,item.certificate_number,item.certificate_company)
   or p_media is not null;

 if substantive and exists(select 1 from public.audits where listing_id=p_id and listing_version=item.version) then
   insert into public.listing_revisions(listing_id,version,title,description,category,evidence,certificate_issuer,certificate_number,certificate_company,attributes,tags,media)
     values(p_id,item.version,item.title,item.description,item.category,item.evidence,item.certificate_issuer,item.certificate_number,item.certificate_company,item.attributes,item.tags,
       coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind)) from public.listing_media m where m.listing_id=p_id),'[]'::jsonb));
   update public.listings set version=version+1 where id=p_id;
 end if;

 update public.listings set title=btrim(p_title),description=btrim(p_description),category=p_category,price_cents=p_price_cents,evidence=btrim(coalesce(p_evidence,'')),
   certificate_issuer=new_issuer,certificate_number=new_number,certificate_company=new_company where id=p_id;

 if p_media is not null then
   if jsonb_typeof(p_media)<>'array' then raise exception 'Invalid photos'; end if;
   if jsonb_array_length(p_media)>9 or
     (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='item')>6 or
     (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='certificate')>3 then raise exception 'Too many photos'; end if;
   delete from public.listing_media where listing_id=p_id;
   for asset in select * from jsonb_array_elements(p_media) loop
     if jsonb_typeof(asset)<>'object' or asset->>'kind' is null or asset->>'kind' not in ('item','certificate')
       or asset->>'path' is null or split_part(asset->>'path','/',1)<>actor::text then raise exception 'Invalid photo owner or type' using errcode='42501'; end if;
     perform 1 from storage.objects where bucket_id='listing-media' and name=asset->>'path' for share;
     if not found then raise exception 'Photo upload is missing'; end if;
     insert into public.listing_media(path,listing_id,kind,position) values(asset->>'path',p_id,asset->>'kind',ordinal);
     ordinal:=ordinal+1;
   end loop;
 end if;
end;$$;
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb) to authenticated;

commit;
