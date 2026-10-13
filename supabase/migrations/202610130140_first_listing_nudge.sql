begin;

-- One "list your first item" email for members who signed up and have not listed anything yet. The ad campaign brings people in as sellers, but
-- most never make a first listing, so a single friendly nudge a day or more after sign-up (with King Credion's artwork) points them back to it.
-- Same pattern as the payout setup reminders: a daily sweep (scheduled in 202610130141, kept separate because the PGlite test suite never loads
-- pg_cron) that sends one Klaviyo event, "First Listing Nudge", which a Klaviyo flow turns into the email.
--
-- Who gets it: a member who signed up between 24 hours and 5 days ago, can sell, has no listing of any status, is not banned or deleted, is not
-- an operator or the App Review test account, and has not been nudged before. At most one email per member, ever (first_listing_nudges is the
-- record). The 5-day window means the first run only reaches recent sign-ups, never the whole member list.
create table public.first_listing_nudges(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.first_listing_nudges enable row level security;
revoke all on public.first_listing_nudges from public,anon,authenticated;

create function public.send_first_listing_nudges() returns integer
language plpgsql security definer set search_path='' as $$
declare member record; sent integer:=0;
begin
  for member in
    select p.id,p.display_name
    from public.profiles p
    join auth.users u on u.id=p.id
    join public.account_permissions ap on ap.user_id=p.id
    where p.created_at<now()-interval '24 hours' and p.created_at>now()-interval '5 days'
      and p.banned_at is null and p.deleted_at is null and ap.can_sell
      and u.email is not null and u.email not ilike 'appreview@%'
      and not exists(select 1 from public.operators o where o.user_id=p.id)
      and not exists(select 1 from public.listings l where l.seller_id=p.id)
      and not exists(select 1 from public.first_listing_nudges n where n.user_id=p.id)
    order by p.created_at
    limit 200 loop
    insert into public.first_listing_nudges(user_id) values(member.id) on conflict do nothing;
    -- first_name is only sent when the member really gave a name (Google sign-in); the default display name "Collector" is not a first name.
    perform public.notify_klaviyo_user(member.id,'First Listing Nudge',
      jsonb_build_object('first_name',case when member.display_name='Collector' then null else nullif(split_part(btrim(member.display_name),' ',1),'') end));
    sent:=sent+1;
  end loop;
  return sent;
end;$$;
revoke all on function public.send_first_listing_nudges() from public,anon,authenticated;
grant execute on function public.send_first_listing_nudges() to service_role;

commit;
