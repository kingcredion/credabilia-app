begin;

-- edit_listing() gains p_subject so a seller can add or correct "Signed by" after publishing --
-- previously the "subject" attribute (and every other item-detail attribute) could only ever be
-- set at creation; 202609300054_signature_reference_library.sql even noted this gap explicitly
-- ("subject can only be set at creation today"). Scoped to just subject here, matching what the
-- edit form now exposes. Param count changes, so drop first (same rule used throughout this
-- migration history: a changed param count otherwise creates a silent second overload).
drop function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,boolean,text);
create function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb,p_needs_review boolean default null,p_needs_review_reason text default null,p_subject text default null)
returns void language plpgsql security definer set search_path='' as $$
declare item public.listings; permitted boolean; actor uuid:=auth.uid();
  new_issuer text:=nullif(btrim(p_issuer),''); new_number text:=nullif(btrim(p_number),''); new_company text:=nullif(btrim(p_company),'');
  new_subject text; substantive boolean; asset jsonb; ordinal integer:=0; main_item_path text;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select can_sell into permitted from public.account_permissions where user_id=actor for share;
 if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
 select * into item from public.listings where id=p_id for update;
 if not found or item.seller_id<>actor then raise exception 'You can only edit your own listing' using errcode='42501'; end if;
 if item.status not in ('active','needs_review') then raise exception 'Only active listings can be edited'; end if;
 if p_expected is distinct from jsonb_build_object('title',item.title,'description',item.description,'category',item.category,'price_cents',item.price_cents,'evidence',item.evidence) then raise exception 'This listing changed. Reopen it before editing.'; end if;

 if p_subject is not null then
   new_subject:=nullif(btrim(p_subject),'');
   if new_subject is not null and length(new_subject)>120 then raise exception 'Keep the signed-by name under 120 characters.'; end if;
 end if;

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
   status=case when p_needs_review is null then status when p_needs_review then 'needs_review' else 'active' end,
   needs_review_reason=case when p_needs_review is null then needs_review_reason else nullif(btrim(coalesce(p_needs_review_reason,'')),'') end,
   attributes=case when p_subject is null then attributes
     when new_subject is null then coalesce(attributes,'{}'::jsonb)-'subject'
     else jsonb_set(coalesce(attributes,'{}'::jsonb),'{subject}',to_jsonb(new_subject)) end
   where id=p_id;

 -- Mirrors create_listing_with_details' own capture call -- a seller adding "Signed by" for the
 -- first time via edit (common case: they forgot it at creation) should become a reference-library
 -- candidate too. capture_signature_reference() already no-ops on its own if there's no signature
 -- photo or no AI note yet, so this is always safe to call.
 if p_subject is not null and new_subject is not null then
   perform public.capture_signature_reference(p_id, new_subject, item.signature_ai_note);
 end if;

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
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,boolean,text,text) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,boolean,text,text) to authenticated;

commit;
