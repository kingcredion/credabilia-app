begin;

-- Same shape and limits as certificate_read_usage (202609100005_extraction_quota.sql) -- every
-- AI/paid-API feature in this app is quota-limited the same way, since each call costs real money
-- (Photoroom's Remove Background API is $0.02/image).
create table public.background_removal_usage(user_id uuid primary key references public.profiles(id),window_start timestamptz not null,attempts integer not null check(attempts between 1 and 5));
alter table public.background_removal_usage enable row level security;
revoke all on public.background_removal_usage from public,anon,authenticated;
create function public.consume_background_removal() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null or not exists(select 1 from public.account_permissions where user_id=actor and can_sell) then raise exception 'Selling permission required' using errcode='42501';end if;
  insert into public.background_removal_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.background_removal_usage.window_start<now()-interval '1 hour' then now() else public.background_removal_usage.window_start end,
  attempts=case when public.background_removal_usage.window_start<now()-interval '1 hour' then 1 else public.background_removal_usage.attempts+1 end
  where public.background_removal_usage.window_start<now()-interval '1 hour' or public.background_removal_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'Background removal limit reached. Try again later.';end if;
end;$$;
revoke all on function public.consume_background_removal() from public,anon;
grant execute on function public.consume_background_removal() to authenticated;
commit;
