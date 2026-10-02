begin;

-- Lets a user ask for a human to call them back, from the support chat -- King Credion (the AI)
-- has no escalation path today, and the existing operator-reply system (admin_reply_to_support,
-- 202609300042_admin_support_and_users.sql) only pushes a notification *to the user* when the
-- operator eventually replies; nothing alerts the operator that someone is waiting. This closes
-- that gap with a direct SMS to the operator's own phone, carrying the caller's number so they
-- can just call back -- no dashboard round-trip required.

-- Fixed destination, not a per-user opt-in -- this is an internal ops alert, not a notification
-- about the recipient's own account, so it doesn't belong in profiles/sms_opt_in.
select vault.create_secret('+17028900202', 'operator_phone', 'Phone number operator alerts (human-callback requests) are sent to.')
where not exists(select 1 from vault.secrets where name='operator_phone');

-- Mirrors notify_sms() exactly, except the destination is the fixed operator_phone secret rather
-- than a per-user opted-in profile -- see send-sms/handler.js's {phone,body} request shape.
create function public.notify_operator_sms(p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare phone text; secret text;
begin
  select decrypted_secret into phone from vault.decrypted_secrets where name='operator_phone';
  if phone is null then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='sms_trigger_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/send-sms',
    body:=jsonb_build_object('phone',phone,'body',p_body),
    headers:=jsonb_build_object('Content-Type','application/json','x-sms-secret',secret),
    timeout_milliseconds:=5000
  );
exception when others then null;
end;$$;
revoke all on function public.notify_operator_sms(text) from public,anon,authenticated;

create function public.request_human_callback(p_phone text, p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean_phone text; clean_reason text; caller_name text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean_phone:=btrim(coalesce(p_phone,''));
  if clean_phone !~ '^\+?[0-9]{10,15}$' then raise exception 'Enter a valid phone number.'; end if;
  clean_reason:=left(nullif(btrim(coalesce(p_reason,'')),''),300);
  select display_name into caller_name from public.profiles where id=actor;
  perform public.notify_operator_sms(
    'Credabilia: '||coalesce(caller_name,'A user')||' wants a callback. Call '||clean_phone||'.'
    ||case when clean_reason is not null then ' Reason: '||clean_reason else '' end
  );
end;$$;
revoke all on function public.request_human_callback(text,text) from public,anon;
grant execute on function public.request_human_callback(text,text) to authenticated;

commit;
