begin;

-- A listing's main/first item photo (the one shown on the marketplace card) must have had its
-- background removed before the listing can publish. The only uploads that are ever .png are
-- background-removal results -- everything else is re-encoded to .jpg by prepareImage() client-side
-- -- so the extension alone is a reliable signal, with no new column needed.

create or replace function public.create_listing_with_media(p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]')
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; asset jsonb; ordinal integer:=0; actor uuid:=auth.uid(); main_item_path text;
begin
  if actor is null then raise exception 'Sign in to publish photos' using errcode='42501'; end if;
  if p_media is null or jsonb_typeof(p_media)<>'array' then raise exception 'Invalid photos'; end if;
  if jsonb_array_length(p_media)>9 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='item')>6 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='certificate')>3 then raise exception 'Too many photos'; end if;
  select x.asset->>'path' into main_item_path from jsonb_array_elements(p_media) with ordinality as x(asset,ord) where x.asset->>'kind'='item' order by x.ord limit 1;
  if main_item_path is null then raise exception 'Add at least one item photo.'; end if;
  if main_item_path !~ '[.]png$' then raise exception 'Remove the background from your main photo before publishing.'; end if;
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

-- edit_listing: only enforced when the seller actually touches photos (p_media is not null) --
-- listings published before this migration keep working untouched until their photos are edited.
create or replace function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item public.listings; permitted boolean; actor uuid:=auth.uid();
  new_issuer text:=nullif(btrim(p_issuer),''); new_number text:=nullif(btrim(p_number),''); new_company text:=nullif(btrim(p_company),'');
  substantive boolean; asset jsonb; ordinal integer:=0; main_item_path text;
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
   select x.asset->>'path' into main_item_path from jsonb_array_elements(p_media) with ordinality as x(asset,ord) where x.asset->>'kind'='item' order by x.ord limit 1;
   if main_item_path is null then raise exception 'Add at least one item photo.'; end if;
   if main_item_path !~ '[.]png$' then raise exception 'Remove the background from your main photo before publishing.'; end if;
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

commit;
