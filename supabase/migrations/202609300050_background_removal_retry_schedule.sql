-- Kept separate from 202609300049_background_removal_retry.sql for the same reason as
-- 202609250019_escrow_release_schedule.sql / 202609300036_auction_close_schedule.sql: the PGlite
-- test suite has no background-worker support and never loads pg_cron/pg_net.
--
-- Reuses the same 'service_role_key' Vault secret 202609250019_escrow_release_schedule.sql already
-- created -- no need to store it twice.

select cron.schedule('retry-background-removal', '*/15 * * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/retry-background-removal',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
