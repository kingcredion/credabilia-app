-- Kingdom articles publish the moment Grok delivers them (see publish_newsroom_on_delivery);
-- the owner wants no review step, so the review dispatcher no longer runs.
select cron.unschedule('kingdom-review-drafts');
