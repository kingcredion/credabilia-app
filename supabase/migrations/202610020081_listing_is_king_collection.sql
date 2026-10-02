begin;

-- Lets checkout (create-checkout-session) tell whether a listing is a King's Collection item
-- (seller is an operator) without exposing the operators table: King's Collection shipping and
-- insurance are passed through at the carrier rate, other sellers' items keep the 10% markup.
create function public.listing_is_king_collection(p_listing_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings l join public.operators o on o.user_id=l.seller_id where l.id=p_listing_id);
$$;
revoke all on function public.listing_is_king_collection(uuid) from public,anon;
grant execute on function public.listing_is_king_collection(uuid) to authenticated;

commit;
