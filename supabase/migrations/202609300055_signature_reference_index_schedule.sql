-- Kept separate from 202609300054_signature_reference_library.sql for the same reason as every
-- other cron-only migration in this codebase (202609250019_escrow_release_schedule.sql /
-- 202609300036_auction_close_schedule.sql / 202609300050_background_removal_retry_schedule.sql):
-- the PGlite test suite never loads pg_cron/pg_net. Reuses the already-created 'service_role_key'
-- Vault secret -- no need to store it twice.

select cron.schedule('index-signature-references', '*/15 * * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/index-signature-references',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
