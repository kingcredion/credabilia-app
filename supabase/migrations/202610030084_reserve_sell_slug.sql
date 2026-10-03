begin;

-- /sell is now a standalone landing page (App.jsx intercepts it before the single-segment-path-is-a-
-- storefront-slug logic), so no seller may claim it as a store name. Also reserves 'item' and 'img', which
-- already have routes of their own (/item/:id, /img/item/:id). Same function body as
-- 202609300026_reserve_legal_slugs.sql with the longer list.
create or replace function public.update_store_slug(p_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=lower(btrim(p_slug));
  if clean !~ '^[a-z0-9][a-z0-9-]{2,29}$' then raise exception 'Use 3-30 characters: lowercase letters, numbers, and hyphens only.'; end if;
  if clean=any(array['auth','api','admin','app','www','static','assets','terms','privacy','legal','support','help','sell','item','img']) then raise exception 'That store name is reserved. Choose another.'; end if;
  update public.profiles set slug=clean where id=actor;
exception when unique_violation then raise exception 'That store name is already taken.';
end;$$;
revoke all on function public.update_store_slug(text) from public,anon;
grant execute on function public.update_store_slug(text) to authenticated;

commit;
