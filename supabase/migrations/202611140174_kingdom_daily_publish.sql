-- Daily Kingdom articles: one assignment per day from Grok's finished HeyGen package, one correction
-- round when the automatic source check fails, and automatic publishing of articles that pass.

alter table kingdom_editorial.draft_requests
  add column purpose text not null default 'manual' check (purpose in ('manual','daily','correction')),
  add column issue_date date,
  add column correction_of uuid references kingdom_editorial.draft_requests(id),
  add column dispatched_at timestamptz not null default now();

-- At most one delivered article per day, and at most one correction request per story.
create unique index draft_requests_one_daily_packet on kingdom_editorial.draft_requests(issue_date)
  where purpose = 'daily' and packet is not null;
create unique index draft_requests_one_correction on kingdom_editorial.draft_requests(correction_of)
  where purpose = 'correction';

-- Public, already-checked stories. The archive at /kingdom lists every row; static_page rows (the
-- Lennon story) are hand-built HTML files and only appear in the list.
create table public.kingdom_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 90),
  title text not null,
  description text not null,
  published_on date not null,
  sections jsonb,
  static_page boolean not null default false,
  draft_id uuid unique references kingdom_editorial.draft_requests(id),
  issue_date date unique,
  created_at timestamptz not null default now()
);
alter table public.kingdom_articles enable row level security;
revoke all on public.kingdom_articles from public, anon, authenticated;
grant select on public.kingdom_articles to anon, authenticated;
create policy "Published Kingdom articles are public" on public.kingdom_articles for select to anon, authenticated using (true);

insert into public.kingdom_articles(slug, title, description, published_on, static_page)
values ('john-lennon-guitar', 'The provenance of John Lennon’s recovered Framus Hootenanny 12-string',
  'How archival photographs, a distinctive pickguard and a trail of owners helped identify John Lennon''s lost guitar before its $2,857,500 sale.',
  '2026-11-14', true)
on conflict (slug) do nothing;

-- Opens one delivery slot. The caller keeps the token; only its digest is stored.
create function public.kingdom_open_request(p_topic text, p_digest text, p_purpose text, p_issue_date date, p_correction_of uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if p_topic is null or length(trim(p_topic)) not between 5 and 300
     or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
     or p_purpose not in ('manual','daily','correction')
     or (p_purpose = 'daily' and p_issue_date is null)
     or (p_purpose = 'correction' and p_correction_of is null) then
    raise exception 'Invalid draft request';
  end if;
  if p_purpose = 'daily' and exists (select 1 from kingdom_editorial.draft_requests
      where purpose = 'daily' and issue_date = p_issue_date and packet is not null) then
    raise exception 'Daily article already received';
  end if;
  insert into kingdom_editorial.draft_requests(topic, token_sha256, expires_at, purpose, issue_date, correction_of)
  values (trim(p_topic), p_digest, now() + case when p_purpose = 'daily' then interval '36 hours' else interval '1 day' end,
          p_purpose, p_issue_date, p_correction_of)
  returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.kingdom_open_request(text,text,text,date,uuid) from public, anon, authenticated;
grant execute on function public.kingdom_open_request(text,text,text,date,uuid) to service_role;

create function public.kingdom_daily_received(p_issue_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from kingdom_editorial.draft_requests where purpose = 'daily' and issue_date = p_issue_date and packet is not null);
$$;
revoke all on function public.kingdom_daily_received(date) from public, anon, authenticated;
grant execute on function public.kingdom_daily_received(date) to service_role;

-- Same contract as before (one token fills one draft; an identical retry succeeds without a second
-- copy), plus: a day's article can only arrive once, whichever of that day's tokens delivers it.
create or replace function public.kingdom_receive_draft(p_token text, p_packet jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  target kingdom_editorial.draft_requests%rowtype;
  earlier jsonb;
  section jsonb;
begin
  if p_token is null or length(p_token) <> 64 then return false; end if;
  select * into target from kingdom_editorial.draft_requests
    where token_sha256 = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and expires_at > now() for update;
  if not found then return false; end if;
  if target.packet is not null then return target.packet = p_packet; end if;
  if target.purpose = 'daily' then
    select packet into earlier from kingdom_editorial.draft_requests
      where purpose = 'daily' and issue_date = target.issue_date and packet is not null;
    if found then return earlier = p_packet; end if;
  end if;
  if p_packet is null or jsonb_typeof(p_packet) <> 'object'
     or octet_length(p_packet::text) > 48000
     or jsonb_typeof(p_packet->'title') is distinct from 'string'
     or length(trim(p_packet->>'title')) not between 3 and 300
     or (p_packet ? 'description' and (jsonb_typeof(p_packet->'description') <> 'string' or length(p_packet->>'description') > 320))
     or jsonb_typeof(p_packet->'sections') is distinct from 'array'
  then return false; end if;
  if jsonb_array_length(p_packet->'sections') not between 1 and 12 then return false; end if;
  for section in select value from jsonb_array_elements(p_packet->'sections') loop
    if jsonb_typeof(section->'text') is distinct from 'string'
       or length(trim(section->>'text')) not between 30 and 6000
       or jsonb_typeof(section->'source') is distinct from 'string'
       or section->>'source' !~ '^https://[A-Za-z0-9.-]+/[^[:space:]]*$'
       or (section ? 'heading' and (jsonb_typeof(section->'heading') <> 'string' or length(section->>'heading') > 160))
    then return false; end if;
  end loop;
  update kingdom_editorial.draft_requests set packet = p_packet, received_at = now() where id = target.id;
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Review: no OpenAI. Each delivered draft is sent to a separate Grok review run, which opens every cited
-- page and reports per paragraph. The report comes back with its own single-use token.
alter table kingdom_editorial.draft_requests
  add column review_attempts integer not null default 0,
  add column review_requested_at timestamptz;

create table kingdom_editorial.review_requests (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references kingdom_editorial.draft_requests(id),
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  report jsonb,
  received_at timestamptz
);
revoke all on kingdom_editorial.review_requests from public, anon, authenticated;
alter table kingdom_editorial.review_requests enable row level security;

-- The OpenAI checker's schedule and lease functions are replaced by the review dispatcher.
select cron.unschedule('kingdom-check-private-drafts') where exists (select 1 from cron.job where jobname = 'kingdom-check-private-drafts');
drop function if exists public.kingdom_claim_check();
drop function if exists public.kingdom_finish_check(uuid,timestamptz,jsonb);

-- Picks the next draft that needs a review (new, or its last review request went unanswered for 2
-- hours; three unanswered requests hold it) and opens a review slot for the caller's token digest.
create function public.kingdom_open_review(p_digest text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target kingdom_editorial.draft_requests%rowtype;
begin
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then raise exception 'Invalid review request'; end if;
  update kingdom_editorial.draft_requests
    set fact_check = jsonb_build_object('outcome','held','reason','No review came back after three requests','checked_at',now())
    where packet is not null and fact_check is null and review_attempts >= 3 and review_requested_at < now() - interval '2 hours';
  select * into target from kingdom_editorial.draft_requests
    where packet is not null and fact_check is null and review_attempts < 3
      and (review_requested_at is null or review_requested_at < now() - interval '2 hours')
    order by received_at limit 1 for update skip locked;
  if not found then return null; end if;
  update kingdom_editorial.draft_requests set review_attempts = review_attempts + 1, review_requested_at = now() where id = target.id;
  insert into kingdom_editorial.review_requests(draft_id, token_sha256, expires_at) values (target.id, p_digest, now() + interval '1 day');
  return jsonb_build_object('id', target.id, 'packet', target.packet);
end;
$$;
revoke all on function public.kingdom_open_review(text) from public, anon, authenticated;
grant execute on function public.kingdom_open_review(text) to service_role;

-- Stores a review report once. Returns the draft to decide on, {"repeat":true,...} for a retry of the
-- same report (or a draft already decided), or null for a bad token, a different second report or a
-- malformed one.
create function public.kingdom_receive_review(p_token text, p_report jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  slot kingdom_editorial.review_requests%rowtype;
  draft kingdom_editorial.draft_requests%rowtype;
  n integer;
  item jsonb;
  seen integer[] := '{}';
begin
  if p_token is null or length(p_token) <> 64 then return null; end if;
  select * into slot from kingdom_editorial.review_requests
    where token_sha256 = encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at > now() for update;
  if not found then return null; end if;
  select * into draft from kingdom_editorial.draft_requests where id = slot.draft_id for update;
  if slot.report is not null then
    if slot.report = p_report then return jsonb_build_object('repeat', true, 'id', draft.id); end if;
    return null;
  end if;
  if draft.fact_check is not null then return jsonb_build_object('repeat', true, 'id', draft.id); end if;
  n := jsonb_array_length(draft.packet->'sections');
  if p_report is null or jsonb_typeof(p_report) <> 'object' or octet_length(p_report::text) > 60000
     or jsonb_typeof(p_report->'sections') is distinct from 'array' or jsonb_array_length(p_report->'sections') <> n then return null; end if;
  for item in select value from jsonb_array_elements(p_report->'sections') loop
    if jsonb_typeof(item->'index') is distinct from 'number' or (item->>'index')::numeric not between 0 and n - 1
       or (item->>'index')::numeric <> floor((item->>'index')::numeric)
       or (item->>'index')::integer = any(seen)
       or jsonb_typeof(item->'pass') is distinct from 'boolean'
       or (item ? 'quotes' and jsonb_typeof(item->'quotes') <> 'array')
       or (item ? 'reason' and jsonb_typeof(item->'reason') <> 'string') then return null; end if;
    seen := seen || (item->>'index')::integer;
  end loop;
  update kingdom_editorial.review_requests set report = p_report, received_at = now() where id = slot.id;
  return jsonb_build_object('id', draft.id, 'purpose', draft.purpose, 'packet', draft.packet);
end;
$$;
revoke all on function public.kingdom_receive_review(text,jsonb) from public, anon, authenticated;
grant execute on function public.kingdom_receive_review(text,jsonb) to service_role;

-- Records a failed review. True only for the call that recorded it, so a correction is requested once.
create function public.kingdom_hold(p_id uuid, p_report jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update kingdom_editorial.draft_requests set fact_check = p_report where id = p_id and fact_check is null;
  return found;
end;
$$;
revoke all on function public.kingdom_hold(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.kingdom_hold(uuid,jsonb) to service_role;

-- Records a passing review and publishes the article. Returns its slug (or the slug this draft or that
-- day's article already has), or null if the draft was already decided otherwise.
create function public.kingdom_publish(p_id uuid, p_report jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  target kingdom_editorial.draft_requests%rowtype;
  parent kingdom_editorial.draft_requests%rowtype;
  day date;
  base text;
  candidate text;
  summary text;
  n integer := 1;
  existing text;
begin
  select * into target from kingdom_editorial.draft_requests where id = p_id for update;
  if not found then return null; end if;
  select slug into existing from public.kingdom_articles where draft_id = p_id;
  if found then return existing; end if;
  if target.fact_check is not null then return null; end if;
  update kingdom_editorial.draft_requests set fact_check = p_report where id = p_id;
  day := target.issue_date;
  if target.purpose = 'correction' then
    select * into parent from kingdom_editorial.draft_requests where id = target.correction_of;
    if parent.purpose = 'daily' then day := parent.issue_date; end if;
  end if;
  if day is not null then
    select slug into existing from public.kingdom_articles where issue_date = day;
    if found then return existing; end if;
  end if;
  base := trim(both '-' from left(regexp_replace(lower(target.packet->>'title'), '[^a-z0-9]+', '-', 'g'), 80));
  if base = '' then base := 'kingdom-story'; end if;
  candidate := base;
  while exists (select 1 from public.kingdom_articles where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  summary := nullif(trim(target.packet->>'description'), '');
  if summary is null then
    summary := target.packet->'sections'->0->>'text';
    if length(summary) > 200 then summary := regexp_replace(left(summary, 200), '\s+\S*$', '') || '…'; end if;
  end if;
  insert into public.kingdom_articles(slug, title, description, published_on, sections, draft_id, issue_date)
  values (candidate, trim(target.packet->>'title'), summary,
          coalesce(day, (now() at time zone 'America/Los_Angeles')::date), target.packet->'sections', target.id, day);
  return candidate;
end;
$$;
revoke all on function public.kingdom_publish(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.kingdom_publish(uuid,jsonb) to service_role;

-- Drafts whose review failed and that have not been sent back for their one correction yet.
create function public.kingdom_pending_correction() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'packet', d.packet, 'report', d.fact_check)
  from kingdom_editorial.draft_requests d
  where d.fact_check->>'outcome' = 'needs_correction'
    and not exists (select 1 from kingdom_editorial.draft_requests c where c.correction_of = d.id)
  order by d.received_at limit 1;
$$;
revoke all on function public.kingdom_pending_correction() from public, anon, authenticated;
grant execute on function public.kingdom_pending_correction() to service_role;

-- Every 10 minutes: send drafts that need a review to Grok's review run, and failed ones back for correction.
select cron.schedule('kingdom-review-drafts', '*/10 * * * *', $job$
 select net.http_post(url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/kingdom-check-draft',
   headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kingdom_dispatch_secret')),
   timeout_milliseconds:=30000)
 where exists (select 1 from kingdom_editorial.draft_requests d where (d.packet is not null and d.fact_check is null
     and (d.review_requested_at is null or d.review_requested_at < now() - interval '2 hours'))
   or (d.fact_check->>'outcome' = 'needs_correction' and not exists (select 1 from kingdom_editorial.draft_requests c where c.correction_of = d.id)));
$job$);

-- Ask Grok for the day's article from Newsroom's finished morning package, then again through the
-- afternoon if nothing has arrived. Each run stops early once that day's article is in.
select cron.schedule('kingdom-daily-assignment', '30 16,18,21,23 * * *', $job$
 select net.http_post(url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/kingdom-request-draft',
   headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kingdom_dispatch_secret'),'Content-Type','application/json'),
   body:='{"daily":true}'::jsonb, timeout_milliseconds:=30000);
$job$);
