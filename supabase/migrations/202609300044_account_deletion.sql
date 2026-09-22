begin;

-- Self-service account deletion, replacing the email-only flow described in the Privacy Policy.
-- This function ONLY anonymizes the profile row -- it deliberately never touches auth.users.
-- profiles.id references auth.users(id) on delete cascade, but purchases/listings/refund_requests/
-- messages/audits/reports/blocks all reference profiles(id) with NO cascade (the default is
-- restrict) -- so a hard `delete from auth.users` here would either fail outright for any user
-- with real transaction history, or (worse, if some FK were cascade) silently destroy the
-- financial records the Privacy Policy promises to keep for 7 years. The delete-account edge
-- function calls this RPC first, then soft-deletes the auth identity via the Admin API
-- (auth.admin.deleteUser(id, true)) -- a soft delete scrambles the login without removing the
-- row, so every foreign key that points at this profile stays intact.

alter table public.profiles add column deleted_at timestamptz;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if exists(select 1 from public.listings where seller_id=actor and status='active') then
    raise exception 'Please remove or sell your active listings before deleting your account.';
  end if;
  if exists(select 1 from public.refund_requests where (buyer_id=actor or seller_id=actor) and status not in ('refunded','denied')) then
    raise exception 'Please resolve your open refund requests before deleting your account.';
  end if;
  update public.profiles set display_name='Deleted user', shipping_address=null, deleted_at=now() where id=actor;
end;$$;
revoke all on function public.delete_my_account() from public,anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
