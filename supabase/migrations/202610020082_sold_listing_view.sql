-- Minimal public view of a SOLD listing, so a shared/bookmarked/Google-indexed /item/:id link keeps
-- landing on a real "Sold" page instead of silently falling back to browse. Deliberately returns no
-- price, seller, or sale details -- only what's needed to show the item and its Sold stamp. Returns
-- null for anything not sold (active items already come through browse; pending, held and unpublished
-- listings stay invisible exactly as before). Photos are already readable by anyone via the
-- read_listing_media storage policy, so no storage change is needed.
create function public.get_sold_listing(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'category',l.category,
    'photo_path',(select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  )
  from public.listings l where l.id=p_id and l.status='sold';
$$;
revoke all on function public.get_sold_listing(uuid) from public;
grant execute on function public.get_sold_listing(uuid) to anon,authenticated;
