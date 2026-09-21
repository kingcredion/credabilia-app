-- Kept in its own migration, separate from 202609300035_auctions.sql, for the same reason as
-- 202609250019_escrow_release_schedule.sql: the PGlite test suite has no background-worker
-- support and never loads pg_cron/pg_net, so settle_ended_auctions() itself must stay testable
-- without this file. This migration only wires up the hourly production sweep.
--
-- Reuses the same 'service_role_key' Vault secret 202609250019_escrow_release_schedule.sql already
-- created -- no need to store it twice.

select cron.schedule('close-auctions', '0 * * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/close-auctions',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
