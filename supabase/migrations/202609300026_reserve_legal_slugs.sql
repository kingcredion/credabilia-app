begin;

-- /terms and /privacy are about to become real standalone pages, intercepted client-side before
-- the single-segment-path-is-a-storefront-slug logic in App.jsx ever runs. Reserve those slugs
-- (plus a couple of obvious future collisions) so no seller can claim one and shadow the legal
-- pages -- mirrors the existing reserved-word list from 202609210013_storefronts_and_dashboard.sql.
create or replace function public.update_store_slug(p_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=lower(btrim(p_slug));
  if clean !~ '^[a-z0-9][a-z0-9-]{2,29}$' then raise exception 'Use 3-30 characters: lowercase letters, numbers, and hyphens only.'; end if;
  if clean=any(array['auth','api','admin','app','www','static','assets','terms','privacy','legal','support','help']) then raise exception 'That store name is reserved. Choose another.'; end if;
  update public.profiles set slug=clean where id=actor;
exception when unique_violation then raise exception 'That store name is already taken.';
end;$$;
revoke all on function public.update_store_slug(text) from public,anon;
grant execute on function public.update_store_slug(text) to authenticated;

commit;
