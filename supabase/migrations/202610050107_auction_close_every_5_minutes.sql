-- Kept separate from 202610050106_auction_hardening.sql for the same reason as the other schedule migrations: the PGlite test suite never
-- loads pg_cron/pg_net. With soft close an auction can end at any minute, so settlement now runs every 5 minutes instead of hourly
-- (a winner no longer waits up to an hour to find out). Re-scheduling under the same name replaces the hourly job.
select cron.schedule('close-auctions', '*/5 * * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/close-auctions',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
