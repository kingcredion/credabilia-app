begin;

-- Part 1: credibility score only applies to items presented as signed -------------------------
-- An unsigned raw collectible (a plain trading card, for instance) has no business being scored
-- on "credibility" at all -- that concept is about signature/certificate trust, not the item
-- itself. Gate the whole certificate/community/credibility_score bundle behind "does this listing
-- have a signature photo" (the same signal already used client-side for the "Signed by X" badge),
-- and strip those keys entirely when it doesn't -- both CredibilityDetails.jsx and CredibilityMeter
-- already render nothing when credibility_score is missing, so this needs no frontend change at all.

-- Part 2: AI suitability screening ------------------------------------------------------------
-- listings.status gains 'needs_review': a listing draft-listing's AI judged as not clearly
-- memorabilia/collectible-related. Held out of public browse/search/purchase (every buy/bid path
-- already requires status='active', so this needs no checkout changes) but still visible to the
-- seller who owns it, so they can fix it up and resubmit, or to an operator via a small admin queue.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.listings'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.listings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.listings add constraint listings_status_check
  check (status in ('draft','active','pending','needs_review','sold','archived'));
alter table public.listings add column needs_review_reason text;

-- browse_listings(): everyone still sees 'active' listings as today; a caller additionally sees
-- their OWN 'needs_review' listings (matching the listings_visible RLS policy's existing shape at
-- the table level: status='active' or seller_id=auth.uid()) so a seller isn't left wondering where
-- their item went. Return type gains needs_review_reason, so this needs a drop first.
drop function public.browse_listings(integer,timestamptz,uuid);
create function public.browse_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table(id uuid,seller_id uuid,seller_name text,title text,description text,evidence text,category text,price_cents bigint,status text,needs_review_reason text,created_at timestamptz,audit_count bigint,version integer,listing_type text,auction_ends_at timestamptz,bid_count integer)
language sql stable security definer set search_path = '' as $$
  select l.id,l.seller_id,p.display_name,l.title,l.description,l.evidence,l.category,l.price_cents,l.status,l.needs_review_reason,l.created_at,
    (select count(*) from public.audits a where a.listing_id = l.id and a.listing_version = l.version),
    l.version,l.listing_type,l.auction_ends_at,l.bid_count
  from public.listings l join public.profiles p on p.id = l.seller_id
  where (l.status = 'active' or (l.status = 'needs_review' and l.seller_id = auth.uid()))
    and (p_after_created_at is null or (l.created_at,l.id) < (p_after_created_at,p_after_id))
  order by l.created_at desc, l.id desc
  limit least(coalesce(p_limit,300),300);
$$;
revoke all on function public.browse_listings(integer,timestamptz,uuid) from public;
grant execute on function public.browse_listings(integer,timestamptz,uuid) to anon, authenticated;

-- browse_scored_listings(): same param signature (no drop needed), body now also drops the
-- certificate/community/credibility_score bundle for any listing with no signature photo.
create or replace function public.browse_scored_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,l.signature_ai_label,l.signature_ai_note,
    exists(select 1 from public.listing_media m where m.listing_id=b.id and m.kind='signature') as signed,
    (l.certificate_issuer is not null and l.certificate_number is not null) as certificate_supplied,
    greatest(0,least(100,
      (case when l.certificate_issuer is not null and l.certificate_number is not null
        then public.certificate_rating(l.certificate_issuer) else 25 end)
      + (case l.signature_ai_label when 'consistent' then 5 when 'concerns' then -15 else 0 end)
    )) as certificate_score,
    round((250+coalesce((select sum(case a.verdict when 'authentic' then 100 when 'uncertain' then 50 else 0 end)
      from public.audits a where a.listing_id=b.id),0))::numeric/(5+b.audit_count))::integer as community_score,
    case when b.audit_count<10 then 80 when b.audit_count<25 then 65 when b.audit_count<100 then 50 else 35 end as certificate_weight
  from public.browse_listings(p_limit,p_after_created_at,p_after_id) b join public.listings l on l.id=b.id
)
select coalesce(jsonb_agg(
  case when s.signed then
    (to_jsonb(s) - 'signed') || jsonb_build_object(
      'community_weight',100-s.certificate_weight,'credibility_audit_count',s.audit_count,
      'credibility_score',round((s.certificate_score*s.certificate_weight+s.community_score*(100-s.certificate_weight))::numeric/100)::integer
    )
  else
    (to_jsonb(s) - 'signed' - 'certificate_score' - 'community_score' - 'certificate_weight' - 'certificate_supplied')
  end
  order by s.created_at desc,s.id desc
),'[]'::jsonb) from scored s;
$$;
revoke all on function public.browse_scored_listings(integer,timestamptz,uuid) from public;
grant execute on function public.browse_scored_listings(integer,timestamptz,uuid) to anon,authenticated;

-- create_listing_with_media() gains p_needs_review/p_needs_review_reason -- when set, the new
-- listing starts life held instead of active. Param count changes, so drop first (same rule noted
-- throughout this migration history: a changed param count otherwise creates a silent overload).
drop function public.create_listing_with_media(text,text,text,bigint,text,text,text,text,jsonb);
create function public.create_listing_with_media(p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',p_needs_review boolean default false,p_needs_review_reason text default null)
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
  if p_needs_review then
    update public.listings set status='needs_review', needs_review_reason=nullif(btrim(coalesce(p_needs_review_reason,'')),'') where id=new_id;
  end if;
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
revoke all on function public.create_listing_with_media(text,text,text,bigint,text,text,text,text,jsonb,boolean,text) from public,anon;
grant execute on function public.create_listing_with_media(text,text,text,bigint,text,text,text,text,jsonb,boolean,text) to authenticated;

-- create_listing_with_details() gains the same two trailing params, threaded straight through to
-- create_listing_with_media() above.
drop function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer,text,text,boolean,uuid);
create function public.create_listing_with_details(
  p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',
  p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',
  p_attributes jsonb default '{}',p_tags jsonb default '[]',
  p_weight_oz numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,
  p_free_shipping boolean default false,
  p_listing_type text default 'fixed',p_auction_days integer default null,
  p_signature_ai_label text default null,p_signature_ai_note text default null,
  p_pickup_enabled boolean default false,p_pickup_station_id uuid default null,
  p_needs_review boolean default false,p_needs_review_reason text default null
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
  if p_pickup_enabled and not exists(select 1 from public.pickup_stations where id=p_pickup_station_id) then
    raise exception 'Choose a valid pickup location.';
  end if;
  new_id:=public.create_listing_with_media(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company,p_media,p_needs_review,p_needs_review_reason);
  update public.listings set attributes=clean_attributes,tags=clean_tags,
    weight_oz=p_weight_oz,length_in=p_length_in,width_in=p_width_in,height_in=p_height_in,free_shipping=coalesce(p_free_shipping,false),
    listing_type=p_listing_type,auction_ends_at=case when p_listing_type='auction' then now()+make_interval(days=>p_auction_days) else null end,
    signature_ai_label=p_signature_ai_label,signature_ai_note=nullif(btrim(coalesce(p_signature_ai_note,'')),''),
    pickup_enabled=coalesce(p_pickup_enabled,false),pickup_station_id=case when p_pickup_enabled then p_pickup_station_id else null end
    where id=new_id;
  perform public.capture_signature_reference(new_id, clean_attributes->>'subject', p_signature_ai_note);
  perform public.notify_klaviyo((select email from auth.users where id=auth.uid()),'Item Listed',
    jsonb_build_object('listing_id',new_id,'title',p_title,'category',p_category,'price_cents',p_price_cents,'listing_type',p_listing_type));
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer,text,text,boolean,uuid,boolean,text) from public,anon;
grant execute on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,boolean,text,integer,text,text,boolean,uuid,boolean,text) to authenticated;

-- edit_listing() gains the same two trailing params, both optional (default null = "don't touch
-- moderation status", the common case -- e.g. just changing price). When provided (the seller
-- resubmitting after a fix, or an edit touching the photo), it can move a listing between 'active'
-- and 'needs_review'. Also widens the editable-status check so a held listing's owner can still
-- open and fix it -- previously only 'active' listings could be edited at all.
drop function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb);
create function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb,p_needs_review boolean default null,p_needs_review_reason text default null)
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
 if item.status not in ('active','needs_review') then raise exception 'Only active listings can be edited'; end if;
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
   status=case when p_needs_review is null then status when p_needs_review then 'needs_review' else 'active' end,
   needs_review_reason=case when p_needs_review is null then needs_review_reason else nullif(btrim(coalesce(p_needs_review_reason,'')),'') end
   where id=p_id;

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
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,boolean,text) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,boolean,text) to authenticated;

-- Minimal admin review queue, same is_operator()-gated shape as admin_list_signature_references /
-- admin_promote_signature_reference (202609300054_signature_reference_library.sql). Rejecting
-- reuses 'archived' -- the same terminal soft-delete state expired-auction cleanup and report
-- removal already use (202609300057_delete_listing.sql) -- an operator's explicit call is a
-- stronger, final decision than the AI's own auto-flag, which stays resubmittable by the seller.
create function public.admin_list_needs_review_listings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'category',l.category,'seller_name',p.display_name,
    'needs_review_reason',l.needs_review_reason,'created_at',l.created_at,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by l.created_at desc) from public.listings l join public.profiles p on p.id=l.seller_id where l.status='needs_review'),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_needs_review_listings() from public,anon;
grant execute on function public.admin_list_needs_review_listings() to authenticated;

create function public.admin_approve_listing(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.listings set status='active', needs_review_reason=null where id=p_id and status='needs_review';
  if not found then raise exception 'Listing not found or not pending review.'; end if;
end;$$;
revoke all on function public.admin_approve_listing(uuid) from public,anon;
grant execute on function public.admin_approve_listing(uuid) to authenticated;

create function public.admin_reject_listing(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.listings set status='archived', needs_review_reason=nullif(btrim(coalesce(p_reason,'')),'') where id=p_id and status='needs_review';
  if not found then raise exception 'Listing not found or not pending review.'; end if;
end;$$;
revoke all on function public.admin_reject_listing(uuid,text) from public,anon;
grant execute on function public.admin_reject_listing(uuid,text) to authenticated;

commit;
