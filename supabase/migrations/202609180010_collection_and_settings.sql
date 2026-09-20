begin;

create function public.update_profile(p_display_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if char_length(btrim(p_display_name)) < 1 or char_length(btrim(p_display_name)) > 100 then raise exception 'Use a display name between 1 and 100 characters.'; end if;
  update public.profiles set display_name=btrim(p_display_name) where id=auth.uid();
end;$$;
revoke all on function public.update_profile(text) from public,anon;
grant execute on function public.update_profile(text) to authenticated;

create table public.favorites(
  user_id uuid not null references public.profiles(id),
  listing_id uuid not null references public.listings(id),
  created_at timestamptz not null default now(),
  unique(user_id,listing_id)
);
create index favorites_owner on public.favorites(user_id);
alter table public.favorites enable row level security;
revoke all on public.favorites from public,anon,authenticated;

create function public.toggle_favorite(p_listing_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); removed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  delete from public.favorites where user_id=actor and listing_id=p_listing_id returning listing_id into removed;
  if removed is not null then return false; end if;
  insert into public.favorites(user_id,listing_id) values(actor,p_listing_id);
  return true;
end;$$;
revoke all on function public.toggle_favorite(uuid) from public,anon;
grant execute on function public.toggle_favorite(uuid) to authenticated;

create function public.my_favorite_ids() returns uuid[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(listing_id),'{}') from public.favorites where user_id=auth.uid();
$$;
revoke all on function public.my_favorite_ids() from public,anon;
grant execute on function public.my_favorite_ids() to authenticated;

create table public.purchases(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  price_cents bigint not null,
  created_at timestamptz not null default now()
);
create index purchases_buyer on public.purchases(buyer_id);
create index purchases_seller on public.purchases(seller_id);
alter table public.purchases enable row level security;
revoke all on public.purchases from public,anon,authenticated;
grant select on public.purchases to authenticated;
create policy purchases_participant on public.purchases for select to authenticated
using (buyer_id=(select auth.uid()) or seller_id=(select auth.uid()));

drop policy listings_visible on public.listings;
create policy listings_visible on public.listings for select to anon, authenticated
using (status='active' or seller_id=(select auth.uid())
  or exists(select 1 from public.purchases pu where pu.listing_id=listings.id and pu.buyer_id=(select auth.uid())));

create function public.simulate_purchase(p_listing_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; new_id uuid; updated integer;
begin
  if actor is null then raise exception 'Sign in to simulate a purchase' using errcode='42501'; end if;
  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents)
    values(p_listing_id,actor,item.seller_id,item.price_cents) returning id into new_id;
  update public.listings set status='sold' where id=p_listing_id and status='active';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'This item was just sold to someone else.'; end if;
  return new_id;
end;$$;
revoke all on function public.simulate_purchase(uuid) from public,anon;
grant execute on function public.simulate_purchase(uuid) to authenticated;

create function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
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

commit;
