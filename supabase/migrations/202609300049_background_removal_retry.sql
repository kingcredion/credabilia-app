begin;

-- Publishing no longer hard-blocks on background removal (202609300030_require_background_removed_main_photo.sql's
-- original rule). The client now tries to remove the main photo's background at save time on its
-- own, but Photoroom availability shouldn't gate a sale -- if it fails, the listing still publishes
-- with the original photo, and this flags that photo for the retry-background-removal cron job
-- (202609300050_background_removal_retry_schedule.sql) to keep trying until it succeeds or the
-- attempt cap is hit, matching the 5-attempt convention every quota table in this codebase already uses.
alter table public.listing_media add column bg_pending boolean not null default false;
alter table public.listing_media add column bg_attempts integer not null default 0;

create or replace function public.create_listing_with_media(p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]')
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; asset jsonb; ordinal integer:=0; actor uuid:=auth.uid(); main_item_path text;
begin
  if actor is null then raise exception 'Sign in to publish photos' using errcode='42501'; end if;
  if p_media is null or jsonb_typeof(p_media)<>'array' then raise exception 'Invalid photos'; end if;
  if jsonb_array_length(p_media)>10 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='item')>6 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='certificate')>3 or
    (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='signature')>1 then raise exception 'Too many photos'; end if;
  select x.asset->>'path' into main_item_path from jsonb_array_elements(p_media) with ordinality as x(asset,ord) where x.asset->>'kind'='item' order by x.ord limit 1;
  if main_item_path is null then raise exception 'Add at least one item photo.'; end if;
  new_id:=public.create_listing_with_certificate(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company);
  for asset in select * from jsonb_array_elements(p_media) loop
    if jsonb_typeof(asset)<>'object' or asset->>'kind' is null or asset->>'kind' not in ('item','certificate','signature')
      or asset->>'path' is null or split_part(asset->>'path','/',1)<>actor::text then raise exception 'Invalid photo owner or type' using errcode='42501'; end if;
    perform 1 from storage.objects where bucket_id='listing-media' and name=asset->>'path' for share;
    if not found then raise exception 'Photo upload is missing'; end if;
    insert into public.listing_media(path,listing_id,kind,position,bg_pending)
      values(asset->>'path',new_id,asset->>'kind',ordinal, asset->>'path'=main_item_path and main_item_path !~ '[.]png$');
    ordinal:=ordinal+1;
  end loop;
  return new_id;
end;
$$;

create or replace function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb,p_signature_ai_label text default null,p_signature_ai_note text default null)
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
   certificate_issuer=new_issuer,certificate_number=new_number,certificate_company=new_company,
   signature_ai_label=p_signature_ai_label,signature_ai_note=nullif(btrim(coalesce(p_signature_ai_note,'')),'') where id=p_id;

 if p_media is not null then
   if jsonb_typeof(p_media)<>'array' then raise exception 'Invalid photos'; end if;
   if jsonb_array_length(p_media)>10 or
     (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='item')>6 or
     (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='certificate')>3 or
     (select count(*) from jsonb_array_elements(p_media) x where x->>'kind'='signature')>1 then raise exception 'Too many photos'; end if;
   select x.asset->>'path' into main_item_path from jsonb_array_elements(p_media) with ordinality as x(asset,ord) where x.asset->>'kind'='item' order by x.ord limit 1;
   if main_item_path is null then raise exception 'Add at least one item photo.'; end if;
   delete from public.listing_media where listing_id=p_id;
   for asset in select * from jsonb_array_elements(p_media) loop
     if jsonb_typeof(asset)<>'object' or asset->>'kind' is null or asset->>'kind' not in ('item','certificate','signature')
       or asset->>'path' is null or split_part(asset->>'path','/',1)<>actor::text then raise exception 'Invalid photo owner or type' using errcode='42501'; end if;
     perform 1 from storage.objects where bucket_id='listing-media' and name=asset->>'path' for share;
     if not found then raise exception 'Photo upload is missing'; end if;
     insert into public.listing_media(path,listing_id,kind,position,bg_pending)
       values(asset->>'path',p_id,asset->>'kind',ordinal, asset->>'path'=main_item_path and main_item_path !~ '[.]png$');
     ordinal:=ordinal+1;
   end loop;
 end if;
end;$$;
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,text,text) to authenticated;

commit;
