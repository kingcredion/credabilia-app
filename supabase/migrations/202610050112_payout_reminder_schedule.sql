-- Kept separate from 202610050111_relist_switch_and_payout_nudges.sql because the PGlite test suite never loads pg_cron. Runs the daily
-- reminder sweep for sellers whose listings are locked behind Stripe payout setup (14:00 UTC, mid-morning in the US). The function itself
-- enforces the 3-day spacing and the cap of 4 messages per seller.
select cron.schedule('payout-setup-reminders', '0 14 * * *', $$ select public.send_payout_setup_reminders(); $$);
