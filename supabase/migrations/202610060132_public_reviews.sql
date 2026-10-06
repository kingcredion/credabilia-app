begin;

-- Public seller reviews. A buyer's star rating and comment were already shown on the seller's storefront (last 20, with the buyer's full display name). This makes them
-- the way buyers decide: the reviewer is shown as "First L." with the item they bought, the item page can show the seller's latest reviews, the storefront can load more,
-- and anyone signed in can report an unfair or abusive review. An operator can hide a reported review; a hidden review is left out of the public list AND the star average.

alter table public.seller_ratings add column hidden_at timestamptz, add column hidden_by uuid references public.profiles(id);

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('listing','user','message','review'));

-- "David Ortiz" -> "David O."; a single name stays as it is; no name -> "Collector".
create function public.reviewer_label(p text) returns text
language sql immutable set search_path='' as $$
  select case
    when nullif(btrim(coalesce(p,'')),'') is null then 'Collector'
    when array_length(regexp_split_to_array(btrim(p),'\s+'),1)=1 then btrim(p)
    else (regexp_split_to_array(btrim(p),'\s+'))[1]||' '||upper(left((regexp_split_to_array(btrim(p),'\s+'))[array_length(regexp_split_to_array(btrim(p),'\s+'),1)],1))||'.'
  end;
$$;
grant execute on function public.reviewer_label(text) to anon, authenticated, service_role;

-- One page of a seller's visible reviews, newest first. Internal: the public functions below call it.
create function public.seller_review_list(p_seller uuid, p_limit integer, p_offset integer) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(rv) order by rv.created_at desc),'[]'::jsonb) from (
    select sr.id, sr.rating, sr.comment, sr.created_at, public.reviewer_label(bp.display_name) as reviewer, l.title as item_title
    from public.seller_ratings sr
    join public.profiles bp on bp.id=sr.buyer_id
    join public.purchases pu on pu.id=sr.purchase_id
    join public.listings l on l.id=pu.listing_id
    where sr.seller_id=p_seller and sr.hidden_at is null
    order by sr.created_at desc limit greatest(least(coalesce(p_limit,20),50),0) offset greatest(coalesce(p_offset,0),0)) rv;
$$;
revoke all on function public.seller_review_list(uuid,integer,integer) from public,anon,authenticated;

-- The storefront now carries the same review shape (and leaves hidden reviews out of the average).
create or replace function public.get_storefront(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select (select jsonb_build_object(
    'display_name',p.display_name,'slug',p.slug,'member_since',p.created_at,
    'sales_count',(select count(*) from public.purchases where seller_id=p.id),
    'rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=p.id and hidden_at is null),
    'rating_count',(select count(*) from public.seller_ratings where seller_id=p.id and hidden_at is null),
    'reviews',public.seller_review_list(p.id,20,0),
    'listings',coalesce((select jsonb_agg(jsonb_build_object(
        'id',l.id,'title',l.title,'category',l.category,'price_cents',l.price_cents,
        'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
      ) order by l.created_at desc)
      from public.listings l where l.seller_id=p.id and l.status='active'),'[]'::jsonb)
  ) from public.profiles p where p.slug=lower(btrim(p_slug)));
$$;

-- "Show more" on the storefront.
create function public.get_seller_reviews(p_slug text, p_limit integer default 20, p_offset integer default 0) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=p.id and hidden_at is null),
    'rating_count',(select count(*) from public.seller_ratings where seller_id=p.id and hidden_at is null),
    'reviews',public.seller_review_list(p.id,p_limit,p_offset))
  from public.profiles p where p.slug=lower(btrim(p_slug));
$$;
revoke all on function public.get_seller_reviews(text,integer,integer) from public;
grant execute on function public.get_seller_reviews(text,integer,integer) to anon, authenticated;

-- The item page: the listing's seller, their average and their latest few reviews, with the storefront address for "See all reviews".
create function public.get_listing_seller_reviews(p_listing_id uuid, p_limit integer default 3) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('seller_name',p.display_name,'slug',p.slug,
    'rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=p.id and hidden_at is null),
    'rating_count',(select count(*) from public.seller_ratings where seller_id=p.id and hidden_at is null),
    'reviews',public.seller_review_list(p.id,p_limit,0))
  from public.listings l join public.profiles p on p.id=l.seller_id where l.id=p_listing_id;
$$;
revoke all on function public.get_listing_seller_reviews(uuid,integer) from public;
grant execute on function public.get_listing_seller_reviews(uuid,integer) to anon, authenticated;

-- The star average on every listing card and item page leaves hidden reviews out too.
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.browse_listings_with_certificates(integer,timestamp with time zone,uuid)'::regprocedure) into def;
  patched:=replace(def,'from public.seller_ratings where seller_id=l.seller_id)','from public.seller_ratings where seller_id=l.seller_id and hidden_at is null)');
  if patched=def then raise exception 'browse_listings_with_certificates did not contain the expected rating lines'; end if;
  execute patched;
end;
$patch$;

-- Reports: reviews can be reported.
create or replace function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean_reason text; clean_details text; new_id uuid; new_created timestamptz;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_target_type not in ('listing','user','message','review') then raise exception 'Invalid report type.'; end if;
  if p_target_type='review' and not exists(select 1 from public.seller_ratings where id=p_target_id and hidden_at is null) then raise exception 'Review not found.'; end if;
  clean_reason:=btrim(p_reason);
  if clean_reason='' or length(clean_reason)>200 then raise exception 'Choose a reason.'; end if;
  clean_details:=nullif(btrim(coalesce(p_details,'')),'');
  if clean_details is not null and length(clean_details)>2000 then raise exception 'Keep details under 2000 characters.'; end if;
  insert into public.reports(reporter_id,target_type,target_id,reason,details) values(actor,p_target_type,p_target_id,clean_reason,clean_details)
    returning id,created_at into new_id,new_created;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Report',jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'reason',clean_reason));
  return jsonb_build_object('id',new_id,'created_at',new_created);
end;$$;

-- The operator sees what the reviewed words actually are.
create or replace function public.admin_list_reports(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'reporter_id',r.reporter_id,'reporter_name',p.display_name,'target_type',r.target_type,'target_id',r.target_id,
    'reason',r.reason,'details',r.details,'status',r.status,'resolution_note',r.resolution_note,
    'created_at',r.created_at,'resolved_at',r.resolved_at,
    'review',case when r.target_type='review' then (select jsonb_build_object('rating',sr.rating,'comment',sr.comment,'reviewer_name',bp.display_name,'seller_name',sp.display_name,
        'hidden',sr.hidden_at is not null,'item_title',l.title,'created_at',sr.created_at)
      from public.seller_ratings sr join public.profiles bp on bp.id=sr.buyer_id join public.profiles sp on sp.id=sr.seller_id
      join public.purchases pu on pu.id=sr.purchase_id join public.listings l on l.id=pu.listing_id where sr.id=r.target_id) else null end
  ) order by r.created_at desc) from public.reports r join public.profiles p on p.id=r.reporter_id
  where p_status is null or r.status=p_status),'[]'::jsonb);
end;$$;

-- Resolving a review report with "remove" hides the review (it can be put back by clearing hidden_at in the database).
create or replace function public.admin_resolve_report(p_report_id uuid, p_status text, p_note text default null, p_remove_listing boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare report public.reports; clean_note text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'Invalid status.'; end if;
  select * into report from public.reports where id=p_report_id for update;
  if not found then raise exception 'Report not found.'; end if;
  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  update public.reports set status=p_status, resolution_note=clean_note, resolved_at=now() where id=p_report_id;
  if p_remove_listing and report.target_type='listing' then
    update public.listings set status='archived' where id=report.target_id;
  end if;
  if p_remove_listing and report.target_type='review' then
    update public.seller_ratings set hidden_at=now(), hidden_by=auth.uid() where id=report.target_id and hidden_at is null;
  end if;
  return jsonb_build_object('id',p_report_id,'status',p_status);
end;$$;

commit;
