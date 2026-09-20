begin;

-- Public storefronts ------------------------------------------------------------------

alter table public.profiles add column slug text;
create unique index profiles_slug_key on public.profiles(slug) where slug is not null;

create function public.update_store_slug(p_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=lower(btrim(p_slug));
  if clean !~ '^[a-z0-9][a-z0-9-]{2,29}$' then raise exception 'Use 3-30 characters: lowercase letters, numbers, and hyphens only.'; end if;
  if clean=any(array['auth','api','admin','app','www','static','assets']) then raise exception 'That store name is reserved. Choose another.'; end if;
  update public.profiles set slug=clean where id=actor;
exception when unique_violation then raise exception 'That store name is already taken.';
end;$$;
revoke all on function public.update_store_slug(text) from public,anon;
grant execute on function public.update_store_slug(text) to authenticated;

create function public.get_storefront(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select (select jsonb_build_object(
    'display_name',p.display_name,'slug',p.slug,'member_since',p.created_at,
    'sales_count',(select count(*) from public.purchases where seller_id=p.id),
    'listings',coalesce((select jsonb_agg(jsonb_build_object(
        'id',l.id,'title',l.title,'category',l.category,'price_cents',l.price_cents,
        'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
      ) order by l.created_at desc)
      from public.listings l where l.seller_id=p.id and l.status='active'),'[]'::jsonb)
  ) from public.profiles p where p.slug=lower(btrim(p_slug)));
$$;
revoke all on function public.get_storefront(text) from public;
grant execute on function public.get_storefront(text) to anon,authenticated;

-- Relist tracking -----------------------------------------------------------------------

alter table public.listings add column relisted_from_purchase_id uuid references public.purchases(id);

create function public.mark_listing_relisted(p_listing_id uuid, p_purchase_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.purchases where id=p_purchase_id and buyer_id=actor) then raise exception 'Purchase not found.'; end if;
  update public.listings set relisted_from_purchase_id=p_purchase_id where id=p_listing_id and seller_id=actor;
end;$$;
revoke all on function public.mark_listing_relisted(uuid,uuid) from public,anon;
grant execute on function public.mark_listing_relisted(uuid,uuid) to authenticated;

-- my_purchases() now also exposes the purchase id, so a relist can reference it back.
create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.buyer_id=auth.uid();
$$;
revoke all on function public.my_purchases() from public,anon;
grant execute on function public.my_purchases() to authenticated;

-- Private dashboard stats -----------------------------------------------------------------

-- audits had no index on listing_id (only on auditor_id); audits_received below would
-- otherwise force a full table scan on every Dashboard tab open.
create index audits_listing on public.audits(listing_id);

create function public.my_dashboard_stats() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'items_sold',(select count(*) from public.purchases where seller_id=auth.uid()),
    'revenue_cents',(select coalesce(sum(seller_payout_cents),0) from public.purchases where seller_id=auth.uid()),
    'items_bought',(select count(*) from public.purchases where buyer_id=auth.uid()),
    'items_relisted',(select count(*) from public.listings where seller_id=auth.uid() and relisted_from_purchase_id is not null),
    'audits_given',(select count(*) from public.audits where auditor_id=auth.uid()),
    'audits_received',(select count(*) from public.audits a join public.listings l on l.id=a.listing_id where l.seller_id=auth.uid())
  );
$$;
revoke all on function public.my_dashboard_stats() from public,anon;
grant execute on function public.my_dashboard_stats() to authenticated;

commit;
