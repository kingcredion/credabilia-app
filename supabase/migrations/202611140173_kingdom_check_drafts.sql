alter table kingdom_editorial.draft_requests add column fact_check jsonb, add column check_started timestamptz, add column check_attempts integer not null default 0;
create function public.kingdom_claim_check() returns jsonb language sql security definer set search_path='' as $$
 with next as (select id from kingdom_editorial.draft_requests where packet is not null and fact_check is null and check_attempts<3 and (check_started is null or check_started<now()-interval '15 minutes') order by received_at limit 1 for update skip locked)
 update kingdom_editorial.draft_requests d set check_started=clock_timestamp(),check_attempts=check_attempts+1 from next where d.id=next.id returning jsonb_build_object('id',d.id,'lease',d.check_started,'packet',d.packet);
$$;
create function public.kingdom_finish_check(p_id uuid,p_lease timestamptz,p_report jsonb) returns void language sql security definer set search_path='' as $$
 update kingdom_editorial.draft_requests set fact_check=p_report where id=p_id and check_started=p_lease and fact_check is null;
$$;
revoke all on function public.kingdom_claim_check(), public.kingdom_finish_check(uuid,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.kingdom_claim_check(), public.kingdom_finish_check(uuid,timestamptz,jsonb) to service_role;
select cron.schedule('kingdom-check-private-drafts','*/10 * * * *',$job$
 select net.http_post(url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/kingdom-check-draft',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kingdom_dispatch_secret')),timeout_milliseconds:=120000)
 where exists(select 1 from kingdom_editorial.draft_requests where packet is not null and fact_check is null and check_attempts<3 and (check_started is null or check_started<now()-interval '15 minutes'));
$job$);
