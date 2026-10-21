begin;

-- A second, last "list your first item" email. The first nudge goes out 24 hours to 5 days after sign-up; most members never come back after their
-- first visit, so one more reminder about three days later gives a second chance without becoming a drip campaign: at most one reminder per member, ever.
-- Same pattern as the nudge: a daily sweep (scheduled in 202610150148, kept separate because the PGlite test suite never loads pg_cron) that sends one
-- Klaviyo event, "First Listing Reminder", which a Klaviyo flow turns into the email.
--
-- Who gets it: a member who was nudged at least 48 hours ago (and no more than 8 days ago), still has no listing of any status, can sell, is not banned or
-- deleted, is not an operator or the App Review test account, and has not been reminded before.
create table public.first_listing_reminders(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.first_listing_reminders enable row level security;
revoke all on public.first_listing_reminders from public,anon,authenticated;

create function public.send_first_listing_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare member record; sent integer:=0;
begin
  for member in
    select p.id,p.display_name
    from public.first_listing_nudges n
    join public.profiles p on p.id=n.user_id
    join auth.users u on u.id=p.id
    join public.account_permissions ap on ap.user_id=p.id
    where n.sent_at<now()-interval '48 hours' and n.sent_at>now()-interval '8 days'
      and p.banned_at is null and p.deleted_at is null and ap.can_sell
      and u.email is not null and u.email not ilike 'appreview@%'
      and not exists(select 1 from public.operators o where o.user_id=p.id)
      and not exists(select 1 from public.listings l where l.seller_id=p.id)
      and not exists(select 1 from public.first_listing_reminders r where r.user_id=p.id)
    order by n.sent_at
    limit 200 loop
    insert into public.first_listing_reminders(user_id) values(member.id) on conflict do nothing;
    perform public.notify_klaviyo_user(member.id,'First Listing Reminder',
      jsonb_build_object('first_name',case when member.display_name in ('Collector','Royal Member') then null else nullif(split_part(btrim(member.display_name),' ',1),'') end));
    sent:=sent+1;
  end loop;
  return sent;
end;$$;
revoke all on function public.send_first_listing_reminders() from public,anon,authenticated;
grant execute on function public.send_first_listing_reminders() to service_role;

commit;
