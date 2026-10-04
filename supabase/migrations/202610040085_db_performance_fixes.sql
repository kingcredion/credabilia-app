-- Fixes from the Supabase performance advisor (2026-10-04). None of these change behaviour; they only make
-- queries cheaper as the tables grow.

-- 1. Cover every foreign key with an index. Without one, deleting or joining on the parent row scans the child table.
create index if not exists bids_bidder_id_idx on public.bids(bidder_id);
create index if not exists blocks_blocked_id_idx on public.blocks(blocked_id);
create index if not exists checkout_sessions_pickup_station_id_idx on public.checkout_sessions(pickup_station_id);
create index if not exists checkout_sessions_seller_id_idx on public.checkout_sessions(seller_id);
create index if not exists favorites_listing_id_idx on public.favorites(listing_id);
create index if not exists listings_pickup_station_id_idx on public.listings(pickup_station_id);
create index if not exists listings_relisted_from_purchase_id_idx on public.listings(relisted_from_purchase_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists purchases_conversation_id_idx on public.purchases(conversation_id);
create index if not exists purchases_pickup_station_id_idx on public.purchases(pickup_station_id);
create index if not exists reports_reporter_id_idx on public.reports(reporter_id);
create index if not exists seller_ratings_buyer_id_idx on public.seller_ratings(buyer_id);
create index if not exists signature_references_media_path_idx on public.signature_references(media_path);
create index if not exists signature_references_promoted_by_idx on public.signature_references(promoted_by);
create index if not exists signature_references_source_listing_id_idx on public.signature_references(source_listing_id);

-- 2. visible_listing_media called auth.uid() once per photo row. Wrapping it in a sub-select makes Postgres evaluate
--    it once per query. Same rule: photos of active listings are public, and a seller always sees their own.
drop policy if exists visible_listing_media on public.listing_media;
create policy visible_listing_media on public.listing_media for select to anon, authenticated using (
  exists(select 1 from public.listings l where l.id = listing_media.listing_id
    and (l.status = 'active' or l.seller_id = (select auth.uid())))
);

-- 3. favorites had no primary key, only a unique (user_id, listing_id) constraint on two NOT NULL columns. A primary
--    key on the same columns enforces the same rule, so add it and drop the now-redundant unique constraint
--    (otherwise every write would maintain two identical indexes).
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.favorites'::regclass and contype = 'p') then
    alter table public.favorites add primary key (user_id, listing_id);
    alter table public.favorites drop constraint if exists favorites_user_id_listing_id_key;
  end if;
end $$;
