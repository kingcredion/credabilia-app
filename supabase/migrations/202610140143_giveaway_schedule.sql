-- Kept separate from 202610140142_giveaways.sql because the PGlite test suite never loads pg_cron. Every 30 minutes: start any giveaway draw that is due (end date reached, or the
-- optional ticket target hit) and pass an unclaimed prize to the alternate winner. Does nothing when no giveaway is running.
select cron.schedule('giveaway-maintenance', '*/30 * * * *', $$ select public.run_giveaway_maintenance(); $$);
