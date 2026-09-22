begin;

-- Same sliding-window quota shape as consume_certificate_read() (202609100005_extraction_quota.sql):
-- 5 attempts/hour, reset when the window goes stale. Gated on can_sell since this is a seller-side
-- action taken while building a listing, same as the certificate/background-removal/draft quotas.
create table public.signature_analysis_usage(
  user_id uuid primary key references public.profiles(id),
  window_start timestamptz not null,
  attempts integer not null check(attempts between 1 and 5)
);
alter table public.signature_analysis_usage enable row level security;
revoke all on public.signature_analysis_usage from public,anon,authenticated;

create function public.consume_signature_analysis() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); permitted boolean; changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select can_sell into permitted from public.account_permissions where user_id=actor for share;
  if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
  insert into public.signature_analysis_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then now() else public.signature_analysis_usage.window_start end,
  attempts=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then 1 else public.signature_analysis_usage.attempts+1 end
  where public.signature_analysis_usage.window_start<now()-interval '1 hour' or public.signature_analysis_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'You have reached the signature analysis limit for this hour. Try again later.'; end if;
end;$$;
revoke all on function public.consume_signature_analysis() from public,anon;
grant execute on function public.consume_signature_analysis() to authenticated;

commit;
