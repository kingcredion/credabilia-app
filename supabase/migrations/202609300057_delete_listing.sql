begin;

-- Sellers could edit a listing but had no way to remove one themselves -- only an operator could,
-- via admin_resolve_report's p_remove_listing flag (202609300043_reports_and_blocks.sql), which
-- sets status='archived'. This is the same soft-delete: nothing is physically destroyed (matches
-- the immutable-evidence policy everywhere else in this app -- photos, revisions, audits all stay),
-- the listing just stops being active. Same ownership/permission/status gate as edit_listing
-- (202609300056_auto_signature_opinion.sql) -- a listing mid-checkout ('pending') or already
-- 'sold'/'archived' can't be deleted, so this can never pull a listing out from under a buyer.
create function public.delete_listing(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item public.listings; permitted boolean; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select can_sell into permitted from public.account_permissions where user_id=actor for share;
  if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
  select * into item from public.listings where id=p_id for update;
  if not found or item.seller_id<>actor then raise exception 'You can only delete your own listing' using errcode='42501'; end if;
  if item.status<>'active' then raise exception 'Only active listings can be deleted'; end if;
  update public.listings set status='archived' where id=p_id;
end;$$;
revoke all on function public.delete_listing(uuid) from public,anon;
grant execute on function public.delete_listing(uuid) to authenticated;

commit;
