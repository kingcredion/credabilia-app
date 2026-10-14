begin;

-- A new member whose sign-in gave no name used to be called "Collector"; they are now "Royal Member". Members who already have the automatic "Collector" name are renamed too
-- (someone who typed their own name is untouched). The first-listing nudge email treats both automatic names as "no name given" so it never greets anyone as "Royal Member".
create or replace function public.bootstrap_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare shown_name text;
begin
  shown_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Royal Member'), 100);
  insert into public.profiles(id, display_name) values (new.id, shown_name);
  insert into public.account_permissions(user_id) values (new.id);
  insert into public.user_progress(user_id) values (new.id);
  perform public.notify_klaviyo(new.email, 'Signed Up', '{}'::jsonb);
  perform public.notify_klaviyo('kingcredion@credabilia.com', 'Admin Alert: New User', jsonb_build_object(
    'user_email', new.email, 'display_name', shown_name,
    'provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    'signed_up_at', to_char(new.created_at at time zone 'America/Los_Angeles', 'Mon DD, YYYY HH12:MI AM')||' PT'));
  return new;
end;$$;

update public.profiles set display_name='Royal Member' where display_name='Collector';

-- The name shown on a review when the reviewer has no name ("First L." for everyone else).
create or replace function public.reviewer_label(p text) returns text
language sql immutable set search_path='' as $$
  select case
    when nullif(btrim(coalesce(p,'')),'') is null then 'Royal Member'
    when array_length(regexp_split_to_array(btrim(p),'\s+'),1)=1 then btrim(p)
    else (regexp_split_to_array(btrim(p),'\s+'))[1]||' '||upper(left((regexp_split_to_array(btrim(p),'\s+'))[array_length(regexp_split_to_array(btrim(p),'\s+'),1)],1))||'.'
  end;
$$;

create or replace function public.send_first_listing_nudges() returns integer
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
    perform public.notify_klaviyo_user(member.id,'First Listing Nudge',
      jsonb_build_object('first_name',case when member.display_name in ('Collector','Royal Member') then null else nullif(split_part(btrim(member.display_name),' ',1),'') end));
    sent:=sent+1;
  end loop;
  return sent;
end;$$;
revoke all on function public.send_first_listing_nudges() from public,anon,authenticated;
grant execute on function public.send_first_listing_nudges() to service_role;

commit;
