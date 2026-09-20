-- Kept in its own migration, separate from 202609250018_escrow_and_insurance.sql, for the same
-- reason as 202609240017_reward_schedule.sql: the PGlite test suite has no background-worker
-- support and never loads pg_cron/pg_net, so the release logic itself must stay testable without
-- this file. This migration only wires up the daily fallback sweep in production.
--
-- Before running this, fill in your real Supabase service role key below (Project Settings ->
-- API -> service_role secret) so pg_cron can authenticate to the edge function. The key is stored
-- via Supabase Vault, never in plaintext in this file or in any table.
create extension if not exists pg_net;

select vault.create_secret('REPLACE_WITH_YOUR_SERVICE_ROLE_KEY', 'service_role_key');

select cron.schedule('release-stale-escrow', '0 7 * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/release-stale-escrow',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
