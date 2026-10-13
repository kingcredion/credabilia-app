-- Kept separate from 202610130140_first_listing_nudge.sql because the PGlite test suite never loads pg_cron. Runs the daily sweep for the
-- "list your first item" email at 17:00 UTC (10 AM Pacific, 1 PM Eastern). The function itself enforces who is eligible and the one-email-ever rule.
select cron.schedule('first-listing-nudges', '0 17 * * *', $$ select public.send_first_listing_nudges(); $$);
