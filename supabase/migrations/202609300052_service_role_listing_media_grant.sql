-- listing_media (202609100004_media.sql) never granted service_role anything beyond
-- truncate/references/trigger -- no prior service-role code path touched it directly. The new
-- retry-background-removal edge function (202609300049_background_removal_retry.sql) does, via a
-- plain service-role supabase-js client, and RLS bypass for service_role does not skip base table
-- grants -- confirmed live: "permission denied for table listing_media" on every cron run.
grant select, update on public.listing_media to service_role;
