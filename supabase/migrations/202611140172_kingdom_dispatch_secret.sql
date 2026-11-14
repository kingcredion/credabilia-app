-- Keep the database-to-function credential independent of rotating platform keys.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'kingdom_dispatch_secret')
where not exists (select 1 from vault.secrets where name='kingdom_dispatch_secret');
create function public.kingdom_authorize_dispatch(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from vault.decrypted_secrets
    where name='kingdom_dispatch_secret' and decrypted_secret=p_token);
$$;
revoke all on function public.kingdom_authorize_dispatch(text) from public, anon, authenticated;
grant execute on function public.kingdom_authorize_dispatch(text) to service_role;
