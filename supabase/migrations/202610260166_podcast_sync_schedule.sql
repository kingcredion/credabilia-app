-- Kept separate from 202610260165_podcast_episodes.sql because the PGlite test suite never loads pg_cron/pg_net. Reads the podcast feed every hour at ten past, so a new
-- episode has its page within the hour. Reuses the 'service_role_key' Vault secret created by 202609250019_escrow_release_schedule.sql.
select cron.schedule('podcast-sync', '10 * * * *', $$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/podcast-sync',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'))
  );
$$);
