begin;

-- The SEO loop. Every day a background job (supabase/functions/seo-search-console-sync) copies what Google Search Console knows about the site into seo_search_daily:
-- for each day, page and search, how many times we showed up, how many clicks, and the average position. admin_seo_report() turns that into the weekly review the
-- operator sees: this week against last week, the searches that need a better title, the pages close to page one, and the listings that are too thin to rank.
-- Nothing here changes a page or contacts anyone: it only reads and reports.

create table public.seo_search_daily(
  day date not null,
  page text not null,
  query text not null,
  clicks integer not null default 0 check(clicks>=0),
  impressions integer not null default 0 check(impressions>=0),
  avg_position numeric(7,2) not null default 0,
  primary key(day,page,query)
);
create index seo_search_daily_day on public.seo_search_daily(day);
alter table public.seo_search_daily enable row level security;
revoke all on public.seo_search_daily from public,anon,authenticated;

create table public.seo_sync_log(
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  status text not null check(status in ('ok','not_configured','failed')),
  rows_saved integer not null default 0,
  note text
);
alter table public.seo_sync_log enable row level security;
revoke all on public.seo_sync_log from public,anon,authenticated;

-- Called only by the sync function (service role). Saving the same day twice replaces it, so a re-run never double counts.
create function public.seo_ingest_search_rows(p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare saved integer;
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be a list.'; end if;
  if jsonb_array_length(p_rows)>5000 then raise exception 'Too many rows at once.'; end if;
  insert into public.seo_search_daily(day,page,query,clicks,impressions,avg_position)
  select (r->>'day')::date, left(r->>'page',500), left(r->>'query',300), greatest(coalesce((r->>'clicks')::integer,0),0), greatest(coalesce((r->>'impressions')::integer,0),0), coalesce((r->>'position')::numeric,0)
  from jsonb_array_elements(p_rows) r
  where r->>'day' is not null and r->>'page' is not null and r->>'query' is not null
  on conflict(day,page,query) do update set clicks=excluded.clicks, impressions=excluded.impressions, avg_position=excluded.avg_position;
  get diagnostics saved = row_count;
  return saved;
end;$$;
revoke all on function public.seo_ingest_search_rows(jsonb) from public,anon,authenticated;
grant execute on function public.seo_ingest_search_rows(jsonb) to service_role;

create function public.seo_log_sync(p_status text, p_rows integer default 0, p_note text default null) returns void
language sql security definer set search_path='' as $$
  insert into public.seo_sync_log(status,rows_saved,note) values(p_status,coalesce(p_rows,0),left(p_note,500));
  delete from public.seo_sync_log where ran_at < now()-interval '90 days';
$$;
revoke all on function public.seo_log_sync(text,integer,text) from public,anon,authenticated;
grant execute on function public.seo_log_sync(text,integer,text) to service_role;

-- Each page and search over the last p_days days that Google has reported, counted from the newest day we hold (Google's data runs a couple of days behind).
create function public.seo_query_window(p_days integer) returns table(page text, query text, clicks bigint, impressions bigint, avg_position numeric)
language sql stable security definer set search_path='' as $$
  select d.page, d.query, sum(d.clicks), sum(d.impressions), round((sum(d.avg_position*d.impressions)/nullif(sum(d.impressions),0))::numeric,1)
  from public.seo_search_daily d
  where d.day > (select max(day) from public.seo_search_daily) - p_days
  group by d.page, d.query;
$$;
revoke all on function public.seo_query_window(integer) from public,anon,authenticated;

create function public.admin_seo_report() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  newest date; last7 jsonb; prev7 jsonb; low_ctr jsonb; striking jsonb; no_clicks jsonb; top_queries jsonb; issues jsonb; sync jsonb; suggestions jsonb:='[]'::jsonb; r record;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  select max(day) into newest from public.seo_search_daily;
  select to_jsonb(s) into sync from (select ran_at,status,rows_saved,note from public.seo_sync_log order by id desc limit 1) s;

  if newest is not null then
    select jsonb_build_object('clicks',coalesce(sum(clicks),0),'impressions',coalesce(sum(impressions),0),
      'position',round((sum(avg_position*impressions)/nullif(sum(impressions),0))::numeric,1)) into last7
      from public.seo_search_daily where day>newest-7;
    select jsonb_build_object('clicks',coalesce(sum(clicks),0),'impressions',coalesce(sum(impressions),0),
      'position',round((sum(avg_position*impressions)/nullif(sum(impressions),0))::numeric,1)) into prev7
      from public.seo_search_daily where day>newest-14 and day<=newest-7;

    -- Searches where people see us but rarely click: the title and description are what to improve.
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into low_ctr from (
      select page,query,clicks,impressions,avg_position from public.seo_query_window(28)
      where impressions>=20 and clicks::numeric/impressions<0.02 and avg_position<=15 order by impressions desc limit 10) x;
    -- Searches where we sit just off page one: a little more content and links can move them up.
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into striking from (
      select page,query,clicks,impressions,avg_position from public.seo_query_window(28)
      where impressions>=10 and avg_position>=8 and avg_position<=20 order by impressions desc limit 10) x;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into no_clicks from (
      select page, sum(impressions) as impressions, round((sum(avg_position*impressions)/nullif(sum(impressions),0))::numeric,1) as avg_position
      from public.seo_query_window(28) group by page having sum(clicks)=0 and sum(impressions)>=20 order by sum(impressions) desc limit 10) x;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into top_queries from (
      select query, sum(clicks) as clicks, sum(impressions) as impressions, round((sum(avg_position*impressions)/nullif(sum(impressions),0))::numeric,1) as avg_position
      from public.seo_query_window(28) group by query order by sum(clicks) desc, sum(impressions) desc limit 10) x;

    for r in select * from jsonb_to_recordset(low_ctr) as t(page text,query text,clicks bigint,impressions bigint,avg_position numeric) limit 3 loop
      suggestions:=suggestions||to_jsonb('Rewrite the title and description for '||r.page||': it shows for "'||r.query||'" ('||r.impressions||' views, '||r.clicks||' clicks) but few people click.');
    end loop;
    for r in select * from jsonb_to_recordset(striking) as t(page text,query text,clicks bigint,impressions bigint,avg_position numeric) limit 3 loop
      suggestions:=suggestions||to_jsonb('Strengthen '||r.page||' for "'||r.query||'": it sits at position '||r.avg_position||', close to page one. Add detail and link to it from related pages.');
    end loop;
    for r in select * from jsonb_to_recordset(no_clicks) as t(page text,impressions bigint,avg_position numeric) limit 2 loop
      suggestions:=suggestions||to_jsonb(r.page||' appeared '||r.impressions||' times with no clicks. Check how its title reads in results.');
    end loop;
  end if;

  -- Listings too thin to rank, worst first. These are the ones a seller can fix.
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'issues',x.issues) order by array_length(x.issues,1) desc, x.created_at desc),'[]'::jsonb) into issues from (
    select l.id,l.title,l.created_at,
      array_remove(array[
        case when length(coalesce(l.description,''))<60 then 'thin description' end,
        case when not exists(select 1 from public.listing_media m where m.listing_id=l.id and m.kind='item') then 'no photo' end,
        case when length(coalesce(l.title,''))<15 then 'short title' end,
        case when coalesce(jsonb_array_length(l.tags),0)=0 then 'no tags' end],null) as issues
    from public.listings l join public.profiles p on p.id=l.seller_id
    where l.status='active' and p.banned_at is null and p.deleted_at is null and not public.is_giveaway_prize(l.id)
  ) x where array_length(x.issues,1)>0;
  if jsonb_array_length(issues)>0 then
    suggestions:=suggestions||to_jsonb(jsonb_array_length(issues)||' public listings have something that holds back ranking (thin description, no photo, short title or no tags).');
  end if;
  issues:=(select coalesce(jsonb_agg(i),'[]'::jsonb) from (select i from jsonb_array_elements(issues) i limit 20) q);

  return jsonb_build_object('sync',sync,'newest_day',newest,'last_7_days',last7,'previous_7_days',prev7,
    'low_ctr',coalesce(low_ctr,'[]'::jsonb),'striking_distance',coalesce(striking,'[]'::jsonb),'no_clicks',coalesce(no_clicks,'[]'::jsonb),
    'top_queries',coalesce(top_queries,'[]'::jsonb),'listing_issues',issues,'suggestions',suggestions);
end;$$;
revoke all on function public.admin_seo_report() from public,anon;
grant execute on function public.admin_seo_report() to authenticated;

commit;
