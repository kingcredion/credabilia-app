begin;
alter table public.user_progress add column learning_xp bigint not null default 0 check (learning_xp >= 0);

create table public.listing_trivia(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id),
  question text not null check (char_length(question) between 1 and 300),
  options jsonb not null,
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null check (char_length(explanation) between 1 and 600),
  created_at timestamptz not null default now()
);
create table public.trivia_responses(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  user_id uuid not null references public.profiles(id),
  selected_index smallint not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  unique(listing_id,user_id)
);
create index trivia_responses_owner on public.trivia_responses(user_id);
create table public.trivia_generation_usage(user_id uuid primary key references public.profiles(id),window_start timestamptz not null,attempts integer not null check(attempts between 1 and 5));

alter table public.listing_trivia enable row level security;
alter table public.trivia_responses enable row level security;
alter table public.trivia_generation_usage enable row level security;
revoke all on public.listing_trivia from public,anon,authenticated;
revoke all on public.trivia_responses from public,anon,authenticated;
revoke all on public.trivia_generation_usage from public,anon,authenticated;
grant select on public.trivia_responses to authenticated;
create policy trivia_responses_self on public.trivia_responses for select to authenticated using (user_id = (select auth.uid()));

create function public.record_listing_trivia(p_listing_id uuid,p_question text,p_options jsonb,p_correct_index smallint,p_explanation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; existing uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  insert into public.listing_trivia(listing_id,question,options,correct_index,explanation)
    values(p_listing_id,p_question,p_options,p_correct_index,p_explanation)
    on conflict(listing_id) do nothing returning id into new_id;
  if new_id is not null then return new_id; end if;
  select id into existing from public.listing_trivia where listing_id=p_listing_id;
  return existing;
end;$$;
revoke all on function public.record_listing_trivia(uuid,text,jsonb,smallint,text) from public,anon;
grant execute on function public.record_listing_trivia(uuid,text,jsonb,smallint,text) to authenticated;

create function public.get_listing_trivia(p_listing_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when t.id is null then null else
    jsonb_build_object('id',t.id,'question',t.question,'options',t.options) ||
    case when r.id is null then '{}'::jsonb else jsonb_build_object('correct_index',t.correct_index,'explanation',t.explanation,'your_answer',r.selected_index,'correct',r.correct) end
  end
  from public.listing_trivia t
  left join public.trivia_responses r on r.listing_id=t.listing_id and r.user_id=auth.uid()
  where t.listing_id=p_listing_id;
$$;
revoke all on function public.get_listing_trivia(uuid) from public;
grant execute on function public.get_listing_trivia(uuid) to anon,authenticated;

create function public.consume_trivia_generation() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
  insert into public.trivia_generation_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.trivia_generation_usage.window_start<now()-interval '1 hour' then now() else public.trivia_generation_usage.window_start end,
  attempts=case when public.trivia_generation_usage.window_start<now()-interval '1 hour' then 1 else public.trivia_generation_usage.attempts+1 end
  where public.trivia_generation_usage.window_start<now()-interval '1 hour' or public.trivia_generation_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'Trivia generation limit reached. Try again later.';end if;
end;$$;
revoke all on function public.consume_trivia_generation() from public,anon;
grant execute on function public.consume_trivia_generation() to authenticated;

create function public.submit_trivia_response(p_listing_id uuid,p_selected_index smallint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); trivia public.listing_trivia; new_id uuid; is_correct boolean; prior public.trivia_responses;
begin
  if actor is null then raise exception 'Sign in to answer' using errcode='42501'; end if;
  select * into trivia from public.listing_trivia where listing_id=p_listing_id;
  if not found then raise exception 'No question available for this item'; end if;
  if p_selected_index < 0 or p_selected_index >= jsonb_array_length(trivia.options) then raise exception 'Choose one of the listed options'; end if;
  is_correct := p_selected_index = trivia.correct_index;
  insert into public.trivia_responses(listing_id,user_id,selected_index,correct)
    values(p_listing_id,actor,p_selected_index,is_correct)
    on conflict(listing_id,user_id) do nothing returning id into new_id;
  if new_id is null then
    select * into prior from public.trivia_responses where listing_id=p_listing_id and user_id=actor;
    return jsonb_build_object('xp_earned',0,'already_submitted',true,'correct',prior.correct);
  end if;
  update public.user_progress set learning_xp = learning_xp + 3 where user_id = actor;
  if not found then raise exception 'Account progress missing'; end if;
  return jsonb_build_object('xp_earned',3,'already_submitted',false,'correct',is_correct);
end;$$;
revoke all on function public.submit_trivia_response(uuid,smallint) from public,anon;
grant execute on function public.submit_trivia_response(uuid,smallint) to authenticated;
commit;
