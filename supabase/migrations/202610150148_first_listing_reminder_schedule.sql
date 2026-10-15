-- Kept separate from 202610150147_first_listing_reminder.sql because the PGlite test suite never loads pg_cron. Runs the daily sweep for the second
-- "list your first item" email at 17:30 UTC (10:30 AM Pacific), half an hour after the first nudge sweep. The function itself enforces who is eligible
-- and the one-reminder-ever rule.
select cron.schedule('first-listing-reminders', '30 17 * * *', $$ select public.send_first_listing_reminders(); $$);
