-- Kept separate from 202610170152_seo_loop.sql because the PGlite test suite never loads pg_cron/pg_net. Runs the Search Console sync once a day at 08:15 UTC
-- (Google's numbers for a day settle about two days later, so the function re-reads the last several days each time and replaces them).
-- Reuses the 'service_role_key' Vault secret created by 202609250019_escrow_release_schedule.sql.
select cron.schedule('seo-search-console-sync', '15 8 * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/seo-search-console-sync',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
