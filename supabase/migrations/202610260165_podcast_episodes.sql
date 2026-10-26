begin;

-- Podcast episode pages. A background job (supabase/functions/podcast-sync) reads the show's public RSS feed every hour and saves each episode here; /podcast/<slug> shows it.
-- Nothing is written by AI: an episode page is the host's own title, date, audio, picture and description text (all HTML removed), plus what we know about the show format.
-- Episodes are never deleted. One missing from a later feed read (a host hiccup, a partial reply) simply stays as it was.
--   slug            chosen once, when the episode is first seen, and never changed, so a corrected title never breaks a link or a Google result.
--   published_at    the feed's original date, kept even if the host edits it.
--   index_state     'index' or 'noindex', decided by the sync's rules (human-led "David's Take" episode + a real source link + enough text). index_override lets the operator
--                   force either state; hidden removes an episode from every public page and the sitemap.

create table public.podcast_episodes(
  guid text primary key check(length(guid) between 1 and 200),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=80),
  title text not null check(length(title) between 1 and 300),
  display_title text not null check(length(display_title) between 1 and 300),
  published_at timestamptz not null,
  audio_url text check(audio_url is null or audio_url ~ '^https://'),
  image_url text check(image_url is null or image_url ~ '^https://'),
  spotify_url text check(spotify_url is null or spotify_url ~ '^https://'),
  duration_seconds integer check(duration_seconds is null or duration_seconds>0),
  kind text not null check(kind in ('davids_take','ai_hosted')),
  body text not null default '',
  summary text not null default '',
  sources text[] not null default '{}' check(cardinality(sources)<=3),
  transcript text,
  index_state text not null default 'noindex' check(index_state in ('index','noindex')),
  noindex_reason text,
  index_override text check(index_override is null or index_override in ('index','noindex')),
  hidden boolean not null default false,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index podcast_episodes_published on public.podcast_episodes(published_at desc);
alter table public.podcast_episodes enable row level security;
revoke all on public.podcast_episodes from public,anon,authenticated;

create table public.podcast_sync_log(
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  found integer not null default 0,
  inserted integer not null default 0,
  changed integer not null default 0,
  skipped integer not null default 0,
  note text
);
alter table public.podcast_sync_log enable row level security;
revoke all on public.podcast_sync_log from public,anon,authenticated;

-- ---- Used only by the sync function (service role) -----------------------------------------------------------------------------------------------------------------

create function public.podcast_known_episodes() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('guid',guid,'slug',slug)),'[]'::jsonb) from public.podcast_episodes;
$$;
revoke all on function public.podcast_known_episodes() from public,anon,authenticated;
grant execute on function public.podcast_known_episodes() to service_role;

-- Saves a list of episodes. Safe to run again and again: a known episode whose content did not change only has last_seen_at refreshed; one that did change keeps its slug,
-- publication date and operator choices, and gets a new updated_at.
create function public.podcast_upsert_episodes(p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; h text; old_hash text; ins integer:=0; chg integer:=0; arr text[];
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Items must be a list.'; end if;
  if jsonb_array_length(p_items)>500 then raise exception 'Too many episodes at once.'; end if;
  for r in select * from jsonb_array_elements(p_items) loop
    select coalesce(array(select jsonb_array_elements_text(coalesce(r->'sources','[]'::jsonb))),'{}') into arr;
    h:=md5(concat_ws('|',r->>'title',r->>'body',r->>'audio_url',r->>'image_url',r->>'spotify_url',r->>'duration_seconds',r->>'kind',array_to_string(arr,','),r->>'index_state',coalesce(r->>'noindex_reason','')));
    select content_hash into old_hash from public.podcast_episodes where guid=r->>'guid';
    if not found then
      insert into public.podcast_episodes(guid,slug,title,display_title,published_at,audio_url,image_url,spotify_url,duration_seconds,kind,body,summary,sources,index_state,noindex_reason,content_hash)
      values(r->>'guid',r->>'slug',r->>'title',r->>'display_title',(r->>'published_at')::timestamptz,nullif(r->>'audio_url',''),nullif(r->>'image_url',''),nullif(r->>'spotify_url',''),nullif(r->>'duration_seconds','')::integer,
        r->>'kind',coalesce(r->>'body',''),coalesce(r->>'summary',''),arr,r->>'index_state',nullif(r->>'noindex_reason',''),h);
      ins:=ins+1;
    elsif old_hash<>h then
      update public.podcast_episodes set title=r->>'title',display_title=r->>'display_title',audio_url=nullif(r->>'audio_url',''),image_url=nullif(r->>'image_url',''),spotify_url=nullif(r->>'spotify_url',''),
        duration_seconds=nullif(r->>'duration_seconds','')::integer,kind=r->>'kind',body=coalesce(r->>'body',''),summary=coalesce(r->>'summary',''),sources=arr,index_state=r->>'index_state',
        noindex_reason=nullif(r->>'noindex_reason',''),content_hash=h,last_seen_at=now(),updated_at=now() where guid=r->>'guid';
      chg:=chg+1;
    else
      update public.podcast_episodes set last_seen_at=now() where guid=r->>'guid';
    end if;
  end loop;
  return jsonb_build_object('inserted',ins,'changed',chg);
end;$$;
revoke all on function public.podcast_upsert_episodes(jsonb) from public,anon,authenticated;
grant execute on function public.podcast_upsert_episodes(jsonb) to service_role;

create function public.podcast_log_sync(p_ok boolean, p_found integer default 0, p_inserted integer default 0, p_changed integer default 0, p_skipped integer default 0, p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.podcast_sync_log(ok,found,inserted,changed,skipped,note) values(p_ok,p_found,p_inserted,p_changed,p_skipped,left(p_note,500));
  delete from public.podcast_sync_log where id in (select id from public.podcast_sync_log order by id desc offset 500);
end;$$;
revoke all on function public.podcast_log_sync(boolean,integer,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.podcast_log_sync(boolean,integer,integer,integer,integer,text) to service_role;

-- ---- Public reading (the website and the search-engine pages) -------------------------------------------------------------------------------------------------------

-- Newest first. Hidden episodes never appear. "index" is the effective state: the operator's choice when there is one, otherwise the rule's.
create function public.podcast_episodes_list() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(x order by x.published_at desc),'[]'::jsonb) from (
    select slug, display_title as title, summary, published_at, image_url, kind, duration_seconds, coalesce(index_override,index_state)='index' as index
    from public.podcast_episodes where not hidden order by published_at desc limit 200) x;
$$;
revoke all on function public.podcast_episodes_list() from public;
grant execute on function public.podcast_episodes_list() to anon, authenticated;

create function public.podcast_episode(p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.podcast_episodes;
begin
  select * into e from public.podcast_episodes where slug=lower(coalesce(p_slug,'')) and not hidden;
  if not found then return null; end if;
  return jsonb_build_object('slug',e.slug,'title',e.display_title,'summary',e.summary,'body',e.body,'published_at',e.published_at,'updated_at',e.updated_at,'audio_url',e.audio_url,'image_url',e.image_url,
    'spotify_url',e.spotify_url,'duration_seconds',e.duration_seconds,'kind',e.kind,'sources',to_jsonb(e.sources),'transcript',e.transcript,'index',coalesce(e.index_override,e.index_state)='index',
    'related',coalesce((select jsonb_agg(jsonb_build_object('slug',o.slug,'title',o.display_title,'published_at',o.published_at,'kind',o.kind) order by o.published_at desc)
      from (select * from public.podcast_episodes where not hidden and guid<>e.guid order by published_at desc limit 4) o),'[]'::jsonb));
end;$$;
revoke all on function public.podcast_episode(text) from public;
grant execute on function public.podcast_episode(text) to anon, authenticated;

-- Only episodes open to search engines, with the date of their last real change.
create function public.podcast_sitemap_entries() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug',slug,'lastmod',updated_at) order by published_at desc),'[]'::jsonb)
  from public.podcast_episodes where not hidden and coalesce(index_override,index_state)='index';
$$;
revoke all on function public.podcast_sitemap_entries() from public;
grant execute on function public.podcast_sitemap_entries() to anon, authenticated;

-- ---- Operator controls ------------------------------------------------------------------------------------------------------------------------------------------------

create function public.admin_podcast_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  return jsonb_build_object(
    'episodes',coalesce((select jsonb_agg(jsonb_build_object('guid',guid,'slug',slug,'title',display_title,'kind',kind,'published_at',published_at,'sources',to_jsonb(sources),'index_state',index_state,
      'noindex_reason',noindex_reason,'index_override',index_override,'hidden',hidden,'effective_index',coalesce(index_override,index_state)='index') order by published_at desc) from public.podcast_episodes),'[]'::jsonb),
    'last_sync',(select to_jsonb(l) from (select s.ran_at,s.ok,s.found,s.inserted,s.changed,s.skipped,s.note from public.podcast_sync_log s order by s.id desc limit 1) l),
    'last_ok_sync',(select s.ran_at from public.podcast_sync_log s where s.ok order by s.id desc limit 1));
end;$$;
revoke all on function public.admin_podcast_overview() from public,anon;
grant execute on function public.admin_podcast_overview() to authenticated;

-- p_state: 'index' or 'noindex' forces it; null goes back to the automatic rule.
create function public.admin_podcast_set_index(p_guid text, p_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  if p_state is not null and p_state not in ('index','noindex') then raise exception 'State must be index, noindex or empty.'; end if;
  update public.podcast_episodes set index_override=p_state,updated_at=now() where guid=p_guid;
  if not found then raise exception 'No such episode.'; end if;
end;$$;
revoke all on function public.admin_podcast_set_index(text,text) from public,anon;
grant execute on function public.admin_podcast_set_index(text,text) to authenticated;

create function public.admin_podcast_set_hidden(p_guid text, p_hidden boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  update public.podcast_episodes set hidden=coalesce(p_hidden,false),updated_at=now() where guid=p_guid;
  if not found then raise exception 'No such episode.'; end if;
end;$$;
revoke all on function public.admin_podcast_set_hidden(text,boolean) from public,anon;
grant execute on function public.admin_podcast_set_hidden(text,boolean) to authenticated;

commit;
