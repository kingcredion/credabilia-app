begin;

-- Signature close-up photos: a new listing_media kind alongside the existing 'item'/'certificate'
-- kinds, capped at 1 per listing. Also adds the two plain columns an AI opinion on that photo
-- gets stored in -- client-submitted the same way certificate_issuer/certificate_number already
-- are (see 202609100002_certificates.sql), not written through a trusted service-role-only path.
-- That's a deliberate match to the existing trust model: certificate details are already
-- self-reported and labeled "not been checked with the issuer by Credabilia" -- the AI opinion
-- carries the same honest caveat, so it doesn't need a stronger guarantee than the evidence it
-- sits next to. The worst case (a seller submits a value without ever calling the AI) is no
-- different from a seller typing in a fake certificate_issuer today.

alter table public.listing_media drop constraint listing_media_kind_check;
alter table public.listing_media add constraint listing_media_kind_check check(kind in ('item','certificate','signature'));

alter table public.listings add column signature_ai_label text check (signature_ai_label is null or signature_ai_label in ('consistent','inconclusive','concerns'));
alter table public.listings add column signature_ai_note text check (signature_ai_note is null or char_length(signature_ai_note)<=500);

-- create_listing_with_media / edit_listing: same bodies as 202609300030_require_background_removed_main_photo.sql,
-- allowing kind='signature' (capped at 1) in the photo-validation loop, and bumping the total-media
-- cap from 9 to 10 so a signature photo doesn't force a trade-off against existing item/certificate photos.
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
  if main_item_path !~ '[.]png$' then raise exception 'Remove the background from your main photo before publishing.'; end if;
  new_id:=public.create_listing_with_certificate(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company);
  for asset in select * from jsonb_array_elements(p_media) loop
    if jsonb_typeof(asset)<>'object' or asset->>'kind' is null or asset->>'kind' not in ('item','certificate','signature')
      or asset->>'path' is null or split_part(asset->>'path','/',1)<>actor::text then raise exception 'Invalid photo owner or type' using errcode='42501'; end if;
    perform 1 from storage.objects where bucket_id='listing-media' and name=asset->>'path' for share;
    if not found then raise exception 'Photo upload is missing'; end if;
    insert into public.listing_media(path,listing_id,kind,position) values(asset->>'path',new_id,asset->>'kind',ordinal);
    ordinal:=ordinal+1;
  end loop;
  return new_id;
end;
$$;

-- edit_listing is gaining two new params -- create or replace only replaces an EXACT signature
-- match, so the old 11-arg version must be dropped explicitly first, or PostgREST calls resolved
-- by named args become ambiguous between the old and new overloads (same failure mode already
-- hit once today with create_listing_with_details/auctions -- "function is not unique").
drop function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb);
create function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb,p_signature_ai_label text default null,p_signature_ai_note text default null)
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
   if main_item_path !~ '[.]png$' then raise exception 'Remove the background from your main photo before publishing.'; end if;
   delete from public.listing_media where listing_id=p_id;
   for asset in select * from jsonb_array_elements(p_media) loop
     if jsonb_typeof(asset)<>'object' or asset->>'kind' is null or asset->>'kind' not in ('item','certificate','signature')
       or asset->>'path' is null or split_part(asset->>'path','/',1)<>actor::text then raise exception 'Invalid photo owner or type' using errcode='42501'; end if;
     perform 1 from storage.objects where bucket_id='listing-media' and name=asset->>'path' for share;
     if not found then raise exception 'Photo upload is missing'; end if;
     insert into public.listing_media(path,listing_id,kind,position) values(asset->>'path',p_id,asset->>'kind',ordinal);
     ordinal:=ordinal+1;
   end loop;
 end if;
end;$$;
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,text,text) to authenticated;

-- create_listing_with_details: same body as 202609300038_klaviyo_events.sql, plus the two new
-- optional params folded into its own post-insert update (same spot attributes/tags/dimensions
-- already land in). Same drop-then-create requirement as edit_listing above.
drop function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer);
create function public.create_listing_with_details(
  p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',
  p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',
  p_attributes jsonb default '{}',p_tags jsonb default '[]',
  p_weight_oz numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,
  p_free_shipping boolean default false,
  p_listing_type text default 'fixed',p_auction_days integer default null,
  p_signature_ai_label text default null,p_signature_ai_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; field record; tag jsonb; clean_attributes jsonb:='{}'; clean_tags jsonb:='[]'; clean text;
  allowed text[]:=array['item_type','subject','year','condition','grading_company','grade'];
begin
  if p_listing_type not in ('fixed','auction') then raise exception 'Invalid listing type.'; end if;
  if p_listing_type='auction' and p_auction_days not in (3,5,7) then raise exception 'Choose a 3, 5, or 7 day auction.'; end if;
  if p_category='Sports' then allowed:=allowed||array['sport','team'];
  elsif p_category='Art' then allowed:=allowed||array['artist','medium','dimensions'];
  elsif p_category='Comics' then allowed:=allowed||array['publisher','issue']; end if;
  if p_attributes is null or jsonb_typeof(p_attributes)<>'object' then raise exception 'Invalid item details'; end if;
  for field in select * from jsonb_each(p_attributes) loop
    if not(field.key=any(allowed)) or jsonb_typeof(field.value)<>'string' then raise exception 'Unsupported item detail'; end if;
    clean:=btrim(field.value#>>'{}');
    if length(clean)>120 then raise exception 'Item detail too long'; end if;
    if clean<>'' then clean_attributes:=clean_attributes||jsonb_build_object(field.key,clean); end if;
  end loop;
  if p_tags is null or jsonb_typeof(p_tags)<>'array' then raise exception 'Invalid tags'; end if;
  for tag in select * from jsonb_array_elements(p_tags) loop
    if jsonb_typeof(tag)<>'string' then raise exception 'Invalid tag'; end if;
    clean:=lower(regexp_replace(btrim(tag#>>'{}'),'\s+',' ','g'));
    if length(clean)>40 then raise exception 'Tag too long'; end if;
    if clean<>'' and not(clean_tags ? clean) then clean_tags:=clean_tags||jsonb_build_array(clean); end if;
  end loop;
  if jsonb_array_length(clean_tags)>8 then raise exception 'Too many tags'; end if;
  if p_weight_oz is null or p_weight_oz<=0 or p_length_in is null or p_length_in<=0
     or p_width_in is null or p_width_in<=0 or p_height_in is null or p_height_in<=0 then
    raise exception 'Enter a valid package weight and size.';
  end if;
  new_id:=public.create_listing_with_media(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company,p_media);
  update public.listings set attributes=clean_attributes,tags=clean_tags,
    weight_oz=p_weight_oz,length_in=p_length_in,width_in=p_width_in,height_in=p_height_in,free_shipping=coalesce(p_free_shipping,false),
    listing_type=p_listing_type,auction_ends_at=case when p_listing_type='auction' then now()+make_interval(days=>p_auction_days) else null end,
    signature_ai_label=p_signature_ai_label,signature_ai_note=nullif(btrim(coalesce(p_signature_ai_note,'')),'')
    where id=new_id;
  perform public.notify_klaviyo((select email from auth.users where id=auth.uid()),'Item Listed',
    jsonb_build_object('listing_id',new_id,'title',p_title,'category',p_category,'price_cents',p_price_cents,'listing_type',p_listing_type));
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer,text,text) from public,anon;
grant execute on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer,text,text) to authenticated;

commit;
