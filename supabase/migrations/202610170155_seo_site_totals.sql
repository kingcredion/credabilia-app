begin;

-- The report's headline totals must match the numbers Search Console shows for the whole site. Google's per-page figures add up differently (a page counts its own
-- views), so the sync now also saves one site-wide row per day (empty page and empty search phrase), and the totals come from those. The per-page rows are still used
-- for "pages seen but never clicked".

create or replace function public.seo_page_window(p_days integer) returns table(page text, clicks bigint, impressions bigint, avg_position numeric)
language sql stable security definer set search_path='' as $$
  select d.page, sum(d.clicks), sum(d.impressions), round((sum(d.avg_position*d.impressions)/nullif(sum(d.impressions),0))::numeric,1)
  from public.seo_search_daily d
  where d.query='' and d.page<>'' and d.day > (select max(day) from public.seo_search_daily) - p_days
  group by d.page;
$$;

do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.admin_seo_report()'::regprocedure) into def;
  patched:=replace(def,'from public.seo_search_daily where query='''' and day>newest-7;','from public.seo_search_daily where query='''' and page='''' and day>newest-7;');
  patched:=replace(patched,'from public.seo_search_daily where query='''' and day>newest-14 and day<=newest-7;','from public.seo_search_daily where query='''' and page='''' and day>newest-14 and day<=newest-7;');
  if patched=def or position('page='''' and day>newest-14' in patched)=0 then raise exception 'admin_seo_report did not contain the expected total lines'; end if;
  execute patched;
end;
$patch$;

commit;
