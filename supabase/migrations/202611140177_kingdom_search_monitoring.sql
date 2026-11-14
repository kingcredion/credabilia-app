-- Search discovery for The Memorabilia Kingdom.
-- 1. kingdom_articles.updated_at: a real "last changed" date for the sitemap. It moves only when the words or address of a story change.
-- 2. kingdom_articles.withdrawn_at: a withdrawn story disappears from the archive, its own page and the sitemap at once (the public read rule hides it).
--    To withdraw: update public.kingdom_articles set withdrawn_at = now() where slug = '...';
-- 3. kingdom_search_status / kingdom_search_runs: what the daily check (edge function kingdom-search-check) last saw for each public Kingdom
--    address, from our own site and from Google's URL Inspection API. Private: only the service role reads or writes them.
-- Publishing never waits on any of this: the check is its own scheduled job and only reads.

alter table public.kingdom_articles add column if not exists updated_at timestamptz;
update public.kingdom_articles set updated_at = created_at where updated_at is null;
alter table public.kingdom_articles alter column updated_at set default now(), alter column updated_at set not null;
alter table public.kingdom_articles add column if not exists withdrawn_at timestamptz;

create or replace function public.kingdom_articles_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.description, new.sections, new.slug) is distinct from (old.title, old.description, old.sections, old.slug) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists kingdom_articles_touch on public.kingdom_articles;
create trigger kingdom_articles_touch before update on public.kingdom_articles for each row execute function public.kingdom_articles_touch();

drop policy if exists "Published Kingdom articles are public" on public.kingdom_articles;
create policy "Published Kingdom articles are public" on public.kingdom_articles for select to anon, authenticated using (withdrawn_at is null);

create table if not exists public.kingdom_search_status (
  url text primary key,
  slug text,
  published_on date,
  checked_at timestamptz not null default now(),
  site jsonb not null default '{}',     -- our own checks: status, canonical, robots, sitemap
  google jsonb,                         -- Google's latest URL Inspection result (null when Google could not be asked)
  problem text,                         -- what needs attention now, or null
  problem_since timestamptz,
  alerted_problem text,                 -- the problem last emailed, so the same one is not emailed every day
  alerted_at timestamptz
);
alter table public.kingdom_search_status enable row level security;
revoke all on public.kingdom_search_status from public, anon, authenticated;

create table if not exists public.kingdom_search_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  status text not null,                 -- ok | attention | google_unavailable | failed
  checked integer not null default 0,
  sitemap jsonb,                        -- what Search Console says about /sitemap.xml
  note text
);
alter table public.kingdom_search_runs enable row level security;
revoke all on public.kingdom_search_runs from public, anon, authenticated;
