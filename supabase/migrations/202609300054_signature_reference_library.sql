begin;

-- Signature reference library: a curated, growing set of signature photos per subject (e.g.
-- "Michael Jordan"), so future AI opinions can be informed by "how does this compare to what
-- we've reviewed before" instead of judging every photo cold. Framed as a score input, never as
-- authentication -- see the discussion in this migration's originating conversation for why that
-- distinction matters (liability: a score is a confidence signal, "authentic" is a legal claim).
--
-- Every signature is auto-captured as a candidate at publish time (self_reported) -- passive,
-- costs the seller nothing extra. Only an operator's explicit promotion (operator_curated) makes
-- a row usable for future comparisons, so the library can't be poisoned by self-reported forgeries
-- the same way a fully-automatic pipeline would be.

create extension if not exists vector with schema extensions;

create table public.signature_references (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null check (char_length(btrim(subject_name)) between 1 and 120),
  media_path text not null references public.listing_media(path),
  source_listing_id uuid not null references public.listings(id),
  provenance text not null default 'self_reported' check (provenance in ('self_reported','operator_curated')),
  description text,
  embedding extensions.vector(1536),
  promoted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index signature_references_subject on public.signature_references(subject_name, provenance);
alter table public.signature_references enable row level security;
revoke all on public.signature_references from public,anon,authenticated;

-- Called only from create_listing_with_details right after it sets signature_ai_label/note --
-- silently a no-op if there's no subject filled in or no signature photo, so it never blocks
-- publishing. No grant needed: security definer functions calling each other run as the shared
-- owner, same as create_listing_with_details already calling create_listing_with_media today.
create function public.capture_signature_reference(p_listing_id uuid, p_subject text, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare sig_path text; clean_subject text; clean_note text;
begin
  clean_subject:=nullif(btrim(coalesce(p_subject,'')),'');
  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  if clean_subject is null or clean_note is null then return; end if;
  select path into sig_path from public.listing_media where listing_id=p_listing_id and kind='signature' limit 1;
  if sig_path is null then return; end if;
  insert into public.signature_references(subject_name,media_path,source_listing_id,description)
    values(clean_subject,sig_path,p_listing_id,clean_note);
end;$$;
revoke all on function public.capture_signature_reference(uuid,text,text) from public,anon,authenticated;

-- create_listing_with_details: same body as 202609300046_signature_media_kind.sql, plus one new
-- capture call after the existing signature_ai_label/note update. edit_listing is intentionally
-- NOT touched here -- it has no p_attributes param (subject can only be set at creation today),
-- so there's nothing new to capture from an edit.
create or replace function public.create_listing_with_details(
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
  perform public.capture_signature_reference(new_id, clean_attributes->>'subject', p_signature_ai_note);
  perform public.notify_klaviyo((select email from auth.users where id=auth.uid()),'Item Listed',
    jsonb_build_object('listing_id',new_id,'title',p_title,'category',p_category,'price_cents',p_price_cents,'listing_type',p_listing_type));
  return new_id;
end;
$$;

-- Admin curation: is_operator()-gated, same shape as admin_list_reports/admin_resolve_report
-- (202609300043_reports_and_blocks.sql). Promotion is the entire trust gate -- no re-upload, no
-- re-analysis, just a provenance flip plus who promoted it.
create function public.admin_list_signature_references(p_provenance text default 'self_reported') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_provenance not in ('self_reported','operator_curated') then raise exception 'Invalid provenance.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',sr.id,'subject_name',sr.subject_name,'path',sr.media_path,'kind','signature',
    'description',sr.description,'provenance',sr.provenance,'has_embedding',sr.embedding is not null,
    'listing_id',sr.source_listing_id,'listing_title',l.title,'created_at',sr.created_at
  ) order by sr.created_at desc) from public.signature_references sr join public.listings l on l.id=sr.source_listing_id
  where sr.provenance=p_provenance),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_signature_references(text) from public,anon;
grant execute on function public.admin_list_signature_references(text) to authenticated;

create function public.admin_promote_signature_reference(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.signature_references set provenance='operator_curated', promoted_by=auth.uid() where id=p_id;
  if not found then raise exception 'Reference not found.'; end if;
  return jsonb_build_object('id',p_id,'provenance','operator_curated');
end;$$;
revoke all on function public.admin_promote_signature_reference(uuid) from public,anon;
grant execute on function public.admin_promote_signature_reference(uuid) to authenticated;

create function public.admin_discard_signature_reference(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  delete from public.signature_references where id=p_id;
  if not found then raise exception 'Reference not found.'; end if;
end;$$;
revoke all on function public.admin_discard_signature_reference(uuid) from public,anon;
grant execute on function public.admin_discard_signature_reference(uuid) to authenticated;

-- Embeddings are always passed as plain text ('[0.01,0.02,...]', pgvector's own text input format)
-- and cast explicitly inside SQL, rather than relying on supabase-js/PostgREST to serialize a raw
-- JS array or a native RPC vector parameter correctly -- text-in, text-out through RPCs is the one
-- format guaranteed to round-trip regardless of client library version.

-- Called by analyze-signature (as the caller's own JWT, not service-role) once it has embedded the
-- new photo's note -- scoped to operator_curated rows only, so a self_reported candidate never
-- influences another seller's opinion until an operator has actually promoted it.
-- search_path='' means the bare <=> operator can't be resolved (operators, like functions, are
-- looked up via search_path, and it lives in the extensions schema) -- OPERATOR(extensions.<=>) is
-- Postgres's explicit-schema syntax for operators, the equivalent of qualifying a function name.
-- Deliberately `language sql`, not plpgsql: a plpgsql function that DECLAREs a local
-- extensions.vector variable reliably crashes PGlite's pgvector WASM build (confirmed by direct
-- isolation while writing this migration's tests -- a plain SQL function with the cast written
-- inline has no such issue, on PGlite or on real Postgres).
create function public.search_signature_references(p_subject text, p_embedding text, p_limit integer default 5) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'similarity',round((1-t.dist)::numeric,4)) order by t.dist)
    from (select id, embedding OPERATOR(extensions.<=>) p_embedding::extensions.vector(1536) as dist
      from public.signature_references
      where provenance='operator_curated' and subject_name=p_subject and embedding is not null
      order by embedding OPERATOR(extensions.<=>) p_embedding::extensions.vector(1536) limit p_limit) t
  ),'[]'::jsonb);
$$;
revoke all on function public.search_signature_references(text,text,integer) from public,anon;
grant execute on function public.search_signature_references(text,text,integer) to authenticated;

-- Both of the following are for index-signature-references (the embedding-backfill cron job) only --
-- service-role client, never called by an authenticated user, so grants are service_role-only
-- (matches settle_ended_auctions()'s pattern of a service_role-only grant).
create function public.list_pending_signature_embeddings(p_limit integer default 25) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'description',description) order by t.created_at asc),'[]'::jsonb)
  from (select id,description,created_at from public.signature_references where embedding is null and description is not null limit p_limit) t;
$$;
revoke all on function public.list_pending_signature_embeddings(integer) from public,anon,authenticated;
grant execute on function public.list_pending_signature_embeddings(integer) to service_role;

create function public.set_signature_embedding(p_id uuid, p_embedding text) returns void
language sql security definer set search_path='' as $$
  update public.signature_references set embedding=p_embedding::extensions.vector(1536) where id=p_id;
$$;
revoke all on function public.set_signature_embedding(uuid,text) from public,anon,authenticated;
grant execute on function public.set_signature_embedding(uuid,text) to service_role;

commit;
