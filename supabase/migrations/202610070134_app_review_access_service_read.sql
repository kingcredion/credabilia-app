-- The review-sign-in function reads the on/off switch with the service role, which had no grant on the (otherwise fully locked) table.
-- Read-only: the function never changes the switch; only the operator does, from the database.
grant select on public.app_review_access to service_role;
