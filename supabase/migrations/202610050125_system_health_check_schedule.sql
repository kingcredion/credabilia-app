-- Kept separate because the PGlite test suite never loads pg_cron. Every 3 hours, looking back 3 hours.
select cron.schedule('system-health-check', '15 */3 * * *', $$ select public.check_system_health(); $$);
