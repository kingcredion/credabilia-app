-- Kept separate from 202610050121_release_expired_holds.sql because the PGlite test suite never loads pg_cron.
select cron.schedule('release-expired-holds', '*/10 * * * *', $$ select public.release_expired_holds(); $$);
