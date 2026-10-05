-- Production-only (pg_cron is not available to the PGlite tests). The payout sweep now runs hourly so a payout is released within
-- the hour once its hold has passed or a buyer releases it early. Same job name as 202609250019, so this replaces the daily schedule;
-- the service_role_key vault secret already exists.
select cron.schedule('release-stale-escrow', '0 * * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/release-stale-escrow',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
