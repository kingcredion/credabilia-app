-- Kept separate from 202611140177 because the PGlite test suite never loads pg_cron/pg_net.
-- Runs the Kingdom search check once a day at 09:45 UTC (1:45 a.m. Pacific), after the Search Console sync (08:15 UTC).
-- It is its own job: publishing never calls it or waits for it.
select cron.schedule('kingdom-search-check', '45 9 * * *', $job$
  select net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/kingdom-search-check',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kingdom_dispatch_secret'),'Content-Type','application/json'),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  );
$job$);
