begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('listing-media','listing-media',false,5242880,array['image/jpeg','image/png','image/webp']);
create table public.listing_media (
  path text primary key,
  listing_id uuid not null references public.listings(id),
  kind text not null check(kind in ('item','certificate')),
  position integer not null check(position between 0 and 8),
  unique(listing_id,position)
);
create index listing_media_listing on public.listing_media(listing_id);
alter table public.listing_media enable row level security;
revoke all on public.listing_media from anon,authenticated;
grant select on public.listing_media to anon,authenticated;
create policy visible_listing_media on public.listing_media for select to anon,authenticated
using(exists(select 1 from public.listings l where l.id=listing_id and (l.status='active' or l.seller_id=auth.uid())));
create policy upload_own_listing_media on storage.objects for insert to authenticated
with check(bucket_id='listing-media' and split_part(name,'/',1)=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$'
  and exists(select 1 from public.account_permissions p where p.user_id=auth.uid() and p.can_sell));
create policy read_listing_media on storage.objects for select to anon,authenticated
using(bucket_id='listing-media' and (split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.listing_media m where m.path=name)));
-- Only unpublished uploads can be removed; published evidence is immutable in this phase.
create policy remove_unpublished_media on storage.objects for delete to authenticated
using(bucket_id='listing-media' and split_part(name,'/',1)=auth.uid()::text
  and not exists(select 1 from public.listing_media m where m.path=name));

create function public.create_listing_with_media(p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]')
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; asset jsonb; ordinal integer:=0; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in to publish photos' using errcode='42501'; end if;
  if p_media is null or jsonb_typeof(p_media)<>'array' then raise exception 'Invalid photos'; end if;
  if jsonb_array_length(p_media)>9 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='item')>6 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='certificate')>3 then raise exception 'Too many photos'; end if;
  new_id:=public.create_listing_with_certificate(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company);
  for asset in select * from jsonb_array_elements(p_media) loop
    if jsonb_typeof(asset)<>'object' or asset->>'kind' is null or asset->>'kind' not in ('item','certificate')
      or asset->>'path' is null or split_part(asset->>'path','/',1)<>actor::text then raise exception 'Invalid photo owner or type' using errcode='42501'; end if;
    perform 1 from storage.objects where bucket_id='listing-media' and name=asset->>'path' for share;
    if not found then raise exception 'Photo upload is missing'; end if;
    insert into public.listing_media(path,listing_id,kind,position) values(asset->>'path',new_id,asset->>'kind',ordinal);
    ordinal:=ordinal+1;
  end loop;
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_media(text,text,text,bigint,text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_listing_with_media(text,text,text,bigint,text,text,text,text,jsonb) to authenticated;
alter function public.browse_listings_with_certificates() rename to browse_scored_listings;
create function public.browse_listings_with_certificates() returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object('media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=(item->>'id')::uuid),'[]'::jsonb)) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_scored_listings()) with ordinality as items(item,position);
$$;
revoke all on function public.browse_listings_with_certificates() from public;
grant execute on function public.browse_listings_with_certificates() to anon,authenticated;
commit;
