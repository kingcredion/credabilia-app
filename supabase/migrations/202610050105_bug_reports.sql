begin;

-- "Report a problem" in the King Credion chat. A bug report is a support message tagged kind='bug', with the page it came from and the
-- browser, so it lands in the operator's existing Support tab and alert email with no new flow to build. The assistant never tries to
-- answer one: report_bug records a fixed thank-you instead.

alter table public.support_messages
  add column kind text not null default 'message' check (kind in ('message','bug')),
  add column page_url text,
  add column user_agent text;

-- At most 5 reports an hour per member.
create function public.report_bug(p_what text, p_steps text, p_page text, p_agent text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); what text:=btrim(coalesce(p_what,'')); steps text:=btrim(coalesce(p_steps,'')); page text:=left(btrim(coalesce(p_page,'')),300); agent text:=left(btrim(coalesce(p_agent,'')),300);
  full_body text; user_row record; thanks_row record; recent integer;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if what='' or length(what)>2000 then raise exception 'Tell us what went wrong, in 1 to 2000 characters.'; end if;
  if length(steps)>1000 then raise exception 'Keep "what you were doing" under 1000 characters.'; end if;
  select count(*) into recent from public.support_messages where user_id=actor and kind='bug' and role='user' and created_at>now()-interval '1 hour';
  if recent>=5 then raise exception 'You have sent several reports in the last hour. Please try again a little later.'; end if;
  full_body:='Bug report: '||what||case when steps<>'' then E'\n\nWhat I was doing: '||steps else '' end;
  insert into public.support_messages(user_id,role,body,kind,page_url,user_agent) values(actor,'user',full_body,'bug',nullif(page,''),nullif(agent,''))
    returning id,created_at into user_row;
  insert into public.support_messages(user_id,role,body,kind) values(actor,'assistant','Thank you for telling us. Your report has gone straight to the Credabilia team and a person will look at it. You can keep using the site, and we will reply here if we need more detail.','bug')
    returning id,created_at into thanks_row;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Support Message',jsonb_build_object('user_id',actor,
    'body','[BUG REPORT] '||left(what,600)||case when steps<>'' then ' | Doing: '||left(steps,300) else '' end||case when page<>'' then ' | Page: '||page else '' end));
  return jsonb_build_object(
    'user_message',jsonb_build_object('id',user_row.id,'role','user','body',full_body,'kind','bug','created_at',user_row.created_at),
    'assistant_message',jsonb_build_object('id',thanks_row.id,'role','assistant','body','Thank you for telling us. Your report has gone straight to the Credabilia team and a person will look at it. You can keep using the site, and we will reply here if we need more detail.','kind','bug','created_at',thanks_row.created_at));
end;$$;
revoke all on function public.report_bug(text,text,text,text) from public,anon;
grant execute on function public.report_bug(text,text,text,text) to authenticated;

create or replace function public.get_support_messages() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'body',body,'kind',kind,'created_at',created_at) order by created_at),'[]'::jsonb)
  from public.support_messages where user_id=auth.uid();
$$;

create or replace function public.admin_get_support_thread(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'role',role,'body',body,'kind',kind,'page_url',page_url,'user_agent',user_agent,'created_at',created_at) order by created_at)
    from public.support_messages where user_id=p_user_id),'[]'::jsonb);
end;$$;

-- has_bug: the conversation contains at least one bug report (shown as a tag in the operator's list).
create or replace function public.admin_list_support_conversations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',x.user_id,'display_name',p.display_name,'last_body',x.last_body,'last_role',x.last_role,'last_created_at',x.last_created_at,
    'has_bug',exists(select 1 from public.support_messages b where b.user_id=x.user_id and b.kind='bug')
  ) order by x.last_created_at desc) from (
    select distinct on (user_id) user_id, body as last_body, role as last_role, created_at as last_created_at
    from public.support_messages order by user_id, created_at desc
  ) x join public.profiles p on p.id=x.user_id),'[]'::jsonb);
end;$$;

commit;
