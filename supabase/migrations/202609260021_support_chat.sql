begin;

-- King Credion support chat: a per-user conversation (not per-purchase, unlike `messages`),
-- same RLS-via-RPC lockdown pattern -- no policies, access only through the functions below.

create table public.support_messages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('user','assistant')),
  body text not null,
  created_at timestamptz not null default now()
);
create index support_messages_user on public.support_messages(user_id, created_at);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from public,anon,authenticated;

create function public.send_support_message(p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  insert into public.support_messages(user_id,role,body) values(actor,'user',clean) returning id,created_at into new_id,new_created;
  return jsonb_build_object('id',new_id,'role','user','body',clean,'created_at',new_created);
end;$$;
revoke all on function public.send_support_message(text) from public,anon;
grant execute on function public.send_support_message(text) to authenticated;

-- The assistant's reply is only ever written by the support-chat edge function after it has
-- actually called the AI service -- never self-reportable by the signed-in user, same trust
-- principle as update_tracking_status/mark_purchase_released.
create function public.record_support_reply(p_user_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text; new_id uuid; new_created timestamptz;
begin
  clean:=btrim(p_body);
  if clean='' or length(clean)>4000 then raise exception 'Invalid reply.'; end if;
  insert into public.support_messages(user_id,role,body) values(p_user_id,'assistant',clean) returning id,created_at into new_id,new_created;
  return jsonb_build_object('id',new_id,'role','assistant','body',clean,'created_at',new_created);
end;$$;
revoke all on function public.record_support_reply(uuid,text) from public,anon,authenticated;
grant execute on function public.record_support_reply(uuid,text) to service_role;

create function public.get_support_messages() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'body',body,'created_at',created_at) order by created_at),'[]'::jsonb)
  from public.support_messages where user_id=auth.uid();
$$;
revoke all on function public.get_support_messages() from public,anon;
grant execute on function public.get_support_messages() to authenticated;

-- Same sliding-window quota shape as consume_trivia_generation(): 20 messages/hour/user.
create table public.support_message_usage(
  user_id uuid primary key references public.profiles(id),
  window_start timestamptz not null,
  attempts integer not null check(attempts between 1 and 20)
);
alter table public.support_message_usage enable row level security;
revoke all on public.support_message_usage from public,anon,authenticated;

create function public.consume_support_message() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
  insert into public.support_message_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.support_message_usage.window_start<now()-interval '1 hour' then now() else public.support_message_usage.window_start end,
  attempts=case when public.support_message_usage.window_start<now()-interval '1 hour' then 1 else public.support_message_usage.attempts+1 end
  where public.support_message_usage.window_start<now()-interval '1 hour' or public.support_message_usage.attempts<20 returning user_id into changed;
  if changed is null then raise exception 'You have reached the support chat limit for this hour. Try again later.';end if;
end;$$;
revoke all on function public.consume_support_message() from public,anon;
grant execute on function public.consume_support_message() to authenticated;

commit;
