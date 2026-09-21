begin;

-- Seller ratings ------------------------------------------------------------------------
-- One rating per purchase (not per seller) -- a buyer rates the specific transaction, and can
-- update it later (e.g. after an issue is resolved). Raw rows stay locked down like audits; every
-- other surface (browse listings, storefronts, my_purchases) only ever sees aggregates or the
-- caller's own row, via security-definer RPCs.

create table public.seller_ratings(
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.purchases(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  buyer_id uuid not null references public.profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seller_ratings_seller on public.seller_ratings(seller_id);
alter table public.seller_ratings enable row level security;
revoke all on public.seller_ratings from public,anon,authenticated;
grant select on public.seller_ratings to authenticated;
-- Buyers see their own rating (to show an "edit" state); sellers can see ratings left about them
-- (to know their own reputation) -- neither can browse everyone else's individual ratings, only
-- the public aggregate exposed through browse_listings_with_certificates()/get_storefront() below.
create policy seller_ratings_buyer on public.seller_ratings for select to authenticated using (buyer_id=(select auth.uid()));
create policy seller_ratings_seller on public.seller_ratings for select to authenticated using (seller_id=(select auth.uid()));

create function public.rate_seller(p_purchase_id uuid, p_rating integer, p_comment text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean_comment text; result public.seller_ratings;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating between 1 and 5 stars.'; end if;
  select * into purchase from public.purchases where id=p_purchase_id;
  if not found or purchase.buyer_id<>actor then raise exception 'Purchase not found.'; end if;
  clean_comment:=nullif(btrim(coalesce(p_comment,'')),'');
  if clean_comment is not null and char_length(clean_comment) > 500 then raise exception 'Keep your comment under 500 characters.'; end if;
  insert into public.seller_ratings(purchase_id,seller_id,buyer_id,rating,comment)
    values(p_purchase_id,purchase.seller_id,actor,p_rating,clean_comment)
  on conflict (purchase_id) do update set rating=excluded.rating,comment=excluded.comment,updated_at=now()
  returning * into result;
  return to_jsonb(result);
end;$$;
revoke all on function public.rate_seller(uuid,integer,text) from public,anon;
grant execute on function public.rate_seller(uuid,integer,text) to authenticated;

-- my_purchases() now also carries the buyer's own rating for each purchase (if any), so the UI can
-- show "Rate this seller" vs. the buyer's existing stars/comment to edit.
create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,'shipping_cost_cents',p.shipping_cost_cents,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'insured',p.insured,'insurance_cost_cents',p.insurance_cost_cents,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'my_rating',sr.rating,'my_rating_comment',sr.comment,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.seller_ratings sr on sr.purchase_id=p.id
  where p.buyer_id=auth.uid();
$$;

-- Public seller reputation, everywhere a seller is shown ------------------------------------

create or replace function public.browse_listings_with_certificates() returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object(
  'attributes',l.attributes,'tags',l.tags,'seller_charges_enabled',coalesce(sa.charges_enabled,false),
  'seller_member_since',p.created_at,
  'seller_sales_count',(select count(*) from public.purchases where seller_id=l.seller_id),
  'seller_rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=l.seller_id),
  'seller_rating_count',(select count(*) from public.seller_ratings where seller_id=l.seller_id)
) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_listings_with_media()) with ordinality as items(item,position)
join public.listings l on l.id=(item->>'id')::uuid
join public.profiles p on p.id=l.seller_id
left join public.stripe_accounts sa on sa.user_id=l.seller_id;
$$;

create or replace function public.get_storefront(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select (select jsonb_build_object(
    'display_name',p.display_name,'slug',p.slug,'member_since',p.created_at,
    'sales_count',(select count(*) from public.purchases where seller_id=p.id),
    'rating_avg',(select round(avg(rating)::numeric,2) from public.seller_ratings where seller_id=p.id),
    'rating_count',(select count(*) from public.seller_ratings where seller_id=p.id),
    'reviews',coalesce((select jsonb_agg(to_jsonb(rv)) from (
        select sr.rating,sr.comment,sr.created_at,bp.display_name as buyer_name
        from public.seller_ratings sr join public.profiles bp on bp.id=sr.buyer_id
        where sr.seller_id=p.id order by sr.created_at desc limit 20
      ) rv),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(jsonb_build_object(
        'id',l.id,'title',l.title,'category',l.category,'price_cents',l.price_cents,
        'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
      ) order by l.created_at desc)
      from public.listings l where l.seller_id=p.id and l.status='active'),'[]'::jsonb)
  ) from public.profiles p where p.slug=lower(btrim(p_slug)));
$$;

commit;
