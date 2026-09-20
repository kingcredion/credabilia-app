begin;
create table public.listing_draft_usage(user_id uuid primary key references public.profiles(id),window_start timestamptz not null,attempts integer not null check(attempts between 1 and 5));
alter table public.listing_draft_usage enable row level security;
revoke all on public.listing_draft_usage from public,anon,authenticated;
create function public.consume_listing_draft() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null or not exists(select 1 from public.account_permissions where user_id=actor and can_sell) then raise exception 'Selling permission required' using errcode='42501';end if;
  insert into public.listing_draft_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.listing_draft_usage.window_start<now()-interval '1 hour' then now() else public.listing_draft_usage.window_start end,
  attempts=case when public.listing_draft_usage.window_start<now()-interval '1 hour' then 1 else public.listing_draft_usage.attempts+1 end
  where public.listing_draft_usage.window_start<now()-interval '1 hour' or public.listing_draft_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'Listing draft limit reached. Try again later.';end if;
end;$$;
revoke all on function public.consume_listing_draft() from public,anon;
grant execute on function public.consume_listing_draft() to authenticated;
commit;
