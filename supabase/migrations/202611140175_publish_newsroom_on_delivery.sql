create function kingdom_editorial.publish_newsroom_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.purpose='daily' or (new.purpose='correction' and exists (
    select 1 from kingdom_editorial.draft_requests where id=new.correction_of and purpose='daily'
  )) then
    perform public.kingdom_publish(new.id,'{"outcome":"published_from_newsroom"}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function kingdom_editorial.publish_newsroom_delivery() from public,anon,authenticated;
create trigger publish_newsroom_delivery after update of packet on kingdom_editorial.draft_requests
for each row when (old.packet is null and new.packet is not null)
execute function kingdom_editorial.publish_newsroom_delivery();

-- Deliver the current issue already in the former review queue, preferring its latest revision.
do $$
declare candidate uuid;
begin
  select d.id into candidate from kingdom_editorial.draft_requests d
  left join kingdom_editorial.draft_requests p on p.id=d.correction_of
  where d.packet is not null and coalesce(p.issue_date,d.issue_date)=(now() at time zone 'America/Los_Angeles')::date
    and (d.purpose='daily' or p.purpose='daily') and d.fact_check is null
  order by d.received_at desc limit 1;
  if candidate is not null then perform public.kingdom_publish(candidate,'{"outcome":"published_from_newsroom"}'::jsonb); end if;
end;
$$;
