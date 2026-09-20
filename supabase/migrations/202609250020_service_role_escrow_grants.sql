-- The escrow release logic (shippo-webhook's delivery-triggered release, and
-- release-stale-escrow's daily fallback sweep) reads public.purchases and
-- public.stripe_accounts directly via a service-role PostgREST client
-- (`service.from('purchases').select(...)`), not through a security-definer RPC like every
-- other service-role code path in this app so far. Table grants matter for that kind of direct
-- read even for service_role (RLS bypass alone doesn't imply a table grant), and neither table
-- had ever granted service_role SELECT before, since nothing needed it until now.
grant select on public.purchases to service_role;
grant select on public.stripe_accounts to service_role;
