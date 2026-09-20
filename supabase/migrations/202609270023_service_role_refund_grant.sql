-- Same bug as 202609250020_service_role_escrow_grants.sql, same fix: process-refund reads
-- public.refund_requests directly via a service-role PostgREST client, not through a
-- security-definer RPC, so service_role needs an explicit table grant -- RLS bypass alone
-- doesn't cover it. Caught live: the seller's "Accept & refund" click succeeded at the RPC
-- step but failed at this read with "Refund request not found," leaving the request stuck at
-- 'accepted' until this grant was added and the edge function was retried.
grant select on public.refund_requests to service_role;
