-- Kept in its own migration, separate from 202609240016_fees_shipping_rewards.sql, specifically
-- so the PGlite-based test suite (which cannot load pg_cron -- it has no background-worker
-- support) never needs to touch this file. Tests call public.run_monthly_auditor_rewards()
-- directly instead; this migration only wires up the schedule that calls it automatically in
-- production.
create extension if not exists pg_cron;

select cron.schedule('monthly-auditor-rewards', '0 6 1 * *', $$select public.run_monthly_auditor_rewards();$$);
