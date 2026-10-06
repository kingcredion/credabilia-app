begin;

-- Nothing told the operator when a scheduled job failed or a call to an edge function / Klaviyo came back with an error: it would have been found
-- by chance. This looks at the last 3 hours and, if anything failed, sends one "Payment Problem" style alert email to the operator with what failed.
-- (It reuses the existing operator alert email, so no new Klaviyo flow is needed.)
create function public.check_system_health() returns jsonb
language plpgsql security definer set search_path='' as $$
declare failed_jobs integer:=0; failed_calls integer:=0; job_detail text; call_detail text; result jsonb;
begin
  select count(*), string_agg(distinct j.jobname||': '||left(coalesce(d.return_message,'failed'),80), '; ')
    into failed_jobs, job_detail
    from cron.job_run_details d join cron.job j on j.jobid=d.jobid
    where d.start_time>now()-interval '3 hours' and d.status<>'succeeded';
  select count(*), string_agg(distinct r.status_code::text, ', ')
    into failed_calls, call_detail
    from net._http_response r
    where r.created>now()-interval '3 hours' and (r.status_code is null or r.status_code>=400 or r.error_msg is not null or coalesce(r.timed_out,false));
  result:=jsonb_build_object('failed_jobs',failed_jobs,'failed_calls',failed_calls);
  if failed_jobs>0 or failed_calls>0 then
    perform public.notify_operator_alert('Admin Alert: Payment Problem',jsonb_build_object(
      'summary','The system health check found failures in the last 3 hours.',
      'reference','health check',
      'detail',concat_ws(' ',
        case when failed_jobs>0 then failed_jobs||' scheduled job run(s) failed ('||coalesce(job_detail,'')||').' end,
        case when failed_calls>0 then failed_calls||' background call(s) returned an error (status '||coalesce(call_detail,'none')||').' end)));
  end if;
  return result;
end;$$;
revoke all on function public.check_system_health() from public,anon,authenticated;
grant execute on function public.check_system_health() to service_role;

commit;
