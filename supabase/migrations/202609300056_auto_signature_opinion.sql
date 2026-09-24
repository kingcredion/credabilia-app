begin;

-- The signature AI opinion used to be seller-triggered and client-submitted (self-reported, same
-- trust model as certificate details -- see 202609300046_signature_media_kind.sql's comment). That
-- was fine when only the seller could write about their own listing. Now the opinion fires
-- automatically at publish time, with a buyer-triggered fallback during an audit for the one case
-- automation can't cover (the OpenAI call failing). Letting a *buyer* write onto someone else's
-- listing needs a stronger guarantee than self-reported -- otherwise a bad-faith buyer could inject
-- a fake "concerns" (sabotage) or "consistent" (collusion) opinion without ever calling the AI.
--
-- submit_signature_opinion is that stronger path: service_role-only, so a client can never call it
-- directly -- only analyze-signature's edge function can, and only right after a real OpenAI call
-- succeeded. `where signature_ai_label is null` is the entire write-once guarantee: atomic,
-- race-safe, first writer (automatic or fallback) wins, permanently.
create function public.submit_signature_opinion(p_listing_id uuid, p_label text, p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wrote boolean;
begin
  if p_label not in ('consistent','inconclusive','concerns') then raise exception 'Invalid label.'; end if;
  update public.listings set signature_ai_label=p_label, signature_ai_note=nullif(btrim(coalesce(p_note,'')),'')
    where id=p_listing_id and signature_ai_label is null
      and exists(select 1 from public.listing_media where listing_id=p_listing_id and kind='signature');
  wrote:=found;
  return jsonb_build_object('written',wrote);
end;$$;
revoke all on function public.submit_signature_opinion(uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_signature_opinion(uuid,text,text) to service_role;

-- edit_listing no longer accepts a client-submitted label/note -- the only write path for an
-- already-published listing is submit_signature_opinion above. Dropping the exact 13-arg signature
-- and recreating without the trailing two params (same drop-then-create requirement noted in
-- 202609300046_signature_media_kind.sql -- PostgREST can't resolve named-arg calls across two
-- overloads with different required-arg counts). Body is otherwise identical to
-- 202609300049_background_removal_retry.sql's version (bg_pending/bg_attempts handling included),
-- minus the signature_ai_label/note columns in the update statement (omitting them from the SET
-- list leaves whatever's already stored untouched).
drop function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb,text,text);
create function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_issuer text,p_number text,p_company text,p_media jsonb,p_expected jsonb)
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
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,text,text,text,jsonb,jsonb) to authenticated;

-- Auditors now trigger this too (the fallback path), not just sellers -- widen the permission
-- check from can_sell-only to can_sell-or-can_audit. Same table, same 5/hour window.
create or replace function public.consume_signature_analysis() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); can_sell_perm boolean; can_audit_perm boolean; changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select can_sell, can_audit into can_sell_perm, can_audit_perm from public.account_permissions where user_id=actor for share;
  if coalesce(can_sell_perm,false)=false and coalesce(can_audit_perm,false)=false then raise exception 'Selling or auditing permission required' using errcode='42501'; end if;
  insert into public.signature_analysis_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then now() else public.signature_analysis_usage.window_start end,
  attempts=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then 1 else public.signature_analysis_usage.attempts+1 end
  where public.signature_analysis_usage.window_start<now()-interval '1 hour' or public.signature_analysis_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'You have reached the signature analysis limit for this hour. Try again later.'; end if;
end;$$;

commit;
