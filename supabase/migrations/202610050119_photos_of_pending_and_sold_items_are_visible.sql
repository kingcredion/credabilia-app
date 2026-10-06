begin;

-- Photos were only readable while a listing was active (or by its seller). So the moment an item was won, reserved or bought, its photo vanished for
-- everyone else: a buyer saw "photo couldn't load" on the item they had just bought, and every email about a pending or sold item (Auction Won,
-- Item Sold, receipts, shipping, refunds) fell back to the crown placeholder because the email image link could not read the photo.
-- A pending or sold listing is already public (the sold-item page), so its photos are too. Archived and drafted listings stay seller-only.
-- The check lives in a function so a visitor who is not signed in is not run through the listings table's own row rules (which look at purchases).
create function public.listing_media_is_visible(p_listing_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings where id=p_listing_id and (status in ('active','pending','sold') or seller_id=auth.uid()));
$$;
revoke all on function public.listing_media_is_visible(uuid) from public;
grant execute on function public.listing_media_is_visible(uuid) to anon, authenticated;

drop policy if exists visible_listing_media on public.listing_media;
create policy visible_listing_media on public.listing_media for select to anon, authenticated using (public.listing_media_is_visible(listing_id));

commit;
