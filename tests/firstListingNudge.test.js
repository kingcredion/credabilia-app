import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();

async function freshDb() {
  const db = new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text,created_at timestamptz not null default now());
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(p_secret text,p_name text,p_description text default null) returns uuid language plpgsql as $$
      declare new_id uuid; begin insert into vault.secrets(name,secret,description) values(p_name,p_secret,p_description) returning id into new_id; return new_id; end;$$;
    create function public.gen_random_bytes(p_len integer) returns bytea language sql as $$select decode(md5(random()::text||clock_timestamp()::text),'hex')$$;
    create schema net;
    create table net._http_calls(id serial primary key,url text,body jsonb,headers jsonb,called_at timestamptz default now());
    create function net.http_post(url text,body jsonb default null,headers jsonb default null,timeout_milliseconds integer default null) returns bigint
      language plpgsql as $$ declare new_id bigint; begin
        if coalesce(headers->>'Content-Type','application/json')<>'application/json' then raise exception 'Content-Type header must be "application/json"'; end if;
        insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
  for (const file of MIGRATIONS) { const sql = await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

let n = 0;
const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');

// Makes a member who signed up `hoursAgo` hours ago (the profile is back-dated; the signup trigger creates it and its permissions).
async function member(raw, {email, name, hoursAgo = 48}) {
  const uid = id();
  await raw('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [uid, email ?? uid.slice(-4) + '@example.test', JSON.stringify(name ? {full_name: name} : {})]);
  await raw("update public.profiles set created_at=now()-($2||' hours')::interval where id=$1", [uid, String(hoursAgo)]);
  return uid;
}

async function nudgeEvents(raw) {
  const rows = (await raw("select body from net._http_calls where url like '%klaviyo%' and body->'data'->'attributes'->'metric'->'data'->'attributes'->>'name'='First Listing Nudge' order by id")).rows;
  return rows.map(r => ({email: r.body.data.attributes.profile.data.attributes.email, props: r.body.data.attributes.properties}));
}

async function world() {
  const ctx = await freshDb();
  await ctx.raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
  await ctx.raw('delete from net._http_calls'); // signups send their own Welcome / admin-alert events; only the nudge matters here
  return ctx;
}

async function sweep(raw) {
  await raw('delete from net._http_calls');
  const sent = (await raw('select public.send_first_listing_nudges() as sent')).rows[0].sent;
  return {sent, events: await nudgeEvents(raw)};
}

test('a member who signed up a day ago and has not listed gets exactly one nudge, with their first name', async () => {
  const {raw} = await world();
  const a = await member(raw, {email: 'alex@example.test', name: 'Alex Morgan Jr.', hoursAgo: 30});
  const first = await sweep(raw);
  assert.equal(first.sent, 1);
  assert.deepEqual(first.events, [{email: 'alex@example.test', props: {first_name: 'Alex'}}]);
  assert.equal((await raw('select count(*)::int as c from public.first_listing_nudges where user_id=$1', [a])).rows[0].c, 1);
  const again = await sweep(raw); // one email per member, ever
  assert.equal(again.sent, 0);
  assert.deepEqual(again.events, []);
});

test('the automatic display names ("Royal Member", and the older "Collector") are not used as a first name', async () => {
  const {raw} = await world();
  const fresh = await member(raw, {email: 'someone@example.test'}); // no full_name -> display name "Royal Member"
  assert.equal((await raw('select display_name from public.profiles where id=$1', [fresh])).rows[0].display_name, 'Royal Member');
  const legacy = await member(raw, {email: 'legacy@example.test'});
  await raw("update public.profiles set display_name='Collector' where id=$1", [legacy]); // a member from before the rename
  const {events} = await sweep(raw);
  assert.equal(events.length, 2);
  for (const e of events) assert.equal(e.props.first_name ?? null, null);
});

test('too new, too old, already listed, banned, deleted, operators, the App Review account and no-selling accounts are skipped', async () => {
  const {raw} = await world();
  await member(raw, {email: 'tooNew@example.test', hoursAgo: 5});
  await member(raw, {email: 'tooOld@example.test', hoursAgo: 24 * 6});
  const listed = await member(raw, {email: 'listed@example.test'});
  await raw("insert into public.listings(seller_id,title,description,category,price_cents,status) values($1,'Signed helmet','A fictional listing for testing only.','Sports',5000,'draft')", [listed]);
  const banned = await member(raw, {email: 'banned@example.test'});
  await raw('update public.profiles set banned_at=now() where id=$1', [banned]);
  const deleted = await member(raw, {email: 'deleted@example.test'});
  await raw('update public.profiles set deleted_at=now() where id=$1', [deleted]);
  const operator = await member(raw, {email: 'operator@example.test'});
  await raw('insert into public.operators(user_id) values($1)', [operator]);
  await member(raw, {email: 'appreview@credabilia.com'});
  const noSell = await member(raw, {email: 'nosell@example.test'});
  await raw('update public.account_permissions set can_sell=false where user_id=$1', [noSell]);
  await member(raw, {email: 'eligible@example.test'});
  const {sent, events} = await sweep(raw);
  assert.equal(sent, 1);
  assert.deepEqual(events.map(e => e.email), ['eligible@example.test']);
});

test('a member who lists after being too new is nudged later only if they still have no listing', async () => {
  const {raw} = await world();
  const m = await member(raw, {email: 'later@example.test', hoursAgo: 2});
  assert.equal((await sweep(raw)).sent, 0);
  await raw("update public.profiles set created_at=now()-interval '2 days' where id=$1", [m]);
  assert.equal((await sweep(raw)).sent, 1);
});

test('the sweep can only be run by the service role', async () => {
  const {db, as} = await world();
  await as('00000000-0000-4000-8000-0000000000aa');
  await assert.rejects(db.query('select public.send_first_listing_nudges()'), /permission denied/);
  await as('00000000-0000-4000-8000-0000000000aa', 'service_role');
  await db.query('select public.send_first_listing_nudges()');
});

test('the nudge table is not readable or writable by app users', async () => {
  const {db, as} = await world();
  await as('00000000-0000-4000-8000-0000000000aa');
  await assert.rejects(db.query('select * from public.first_listing_nudges'), /permission denied/);
  await assert.rejects(db.query("insert into public.first_listing_nudges(user_id) values('00000000-0000-4000-8000-0000000000aa')"), /permission denied/);
});

// pg_cron is not in the PGlite suite, so the schedule lives in its own migration; make sure it exists and runs the right function once a day.
test('the daily schedule migration runs send_first_listing_nudges once a day', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610130141_first_listing_nudge_schedule.sql', import.meta.url), 'utf8');
  assert.match(sql, /cron\.schedule\('first-listing-nudges', '0 17 \* \* \*'/);
  assert.match(sql, /public\.send_first_listing_nudges\(\)/);
});

// ---- the second reminder ----
async function reminderEvents(raw) {
  const rows = (await raw("select body from net._http_calls where url like '%klaviyo%' and body->'data'->'attributes'->'metric'->'data'->'attributes'->>'name'='First Listing Reminder' order by id")).rows;
  return rows.map(r => ({email: r.body.data.attributes.profile.data.attributes.email, props: r.body.data.attributes.properties}));
}
async function remind(raw) {
  await raw('delete from net._http_calls');
  const sent = (await raw('select public.send_first_listing_reminders() as sent')).rows[0].sent;
  return {sent, events: await reminderEvents(raw)};
}
// Makes a member who was nudged `hoursAgo` hours ago (back-dates the nudge record that the daily sweep writes).
async function nudged(raw, opts, hoursAgo = 72) {
  const uid = await member(raw, {...opts, hoursAgo: 96}); // inside the nudge sweep's 24 hours to 5 days window
  await raw('select public.send_first_listing_nudges()');
  await raw("update public.first_listing_nudges set sent_at=now()-($2||' hours')::interval where user_id=$1", [uid, String(hoursAgo)]);
  return uid;
}

test('a member nudged three days ago who still has not listed gets exactly one reminder, with their first name', async () => {
  const {raw} = await world();
  await nudged(raw, {email: 'sam@example.test', name: 'Sam Rivera'}, 72);
  const first = await remind(raw);
  assert.equal(first.sent, 1);
  assert.deepEqual(first.events, [{email: 'sam@example.test', props: {first_name: 'Sam'}}]);
  const again = await remind(raw); // one reminder per member, ever
  assert.equal(again.sent, 0);
  assert.deepEqual(again.events, []);
});

test('no reminder when the nudge is too recent or too old, or the member has since listed, was banned or deleted, or is an operator or the App Review account', async () => {
  const {raw} = await world();
  await nudged(raw, {email: 'recent@example.test'}, 24);
  await nudged(raw, {email: 'old@example.test'}, 24 * 9);
  const listed = await nudged(raw, {email: 'listed@example.test'}, 72);
  await raw("insert into public.listings(seller_id,title,description,category,price_cents,status) values($1,'Signed helmet','A fictional listing for testing only.','Sports',5000,'draft')", [listed]);
  const banned = await nudged(raw, {email: 'banned@example.test'}, 72);
  await raw('update public.profiles set banned_at=now() where id=$1', [banned]);
  const deleted = await nudged(raw, {email: 'deleted@example.test'}, 72);
  await raw('update public.profiles set deleted_at=now() where id=$1', [deleted]);
  const operator = await nudged(raw, {email: 'operator@example.test'}, 72);
  await raw('insert into public.operators(user_id) values($1)', [operator]);
  await nudged(raw, {email: 'appreview@credabilia.com'}, 72);
  await nudged(raw, {email: 'eligible@example.test'}, 72);
  const {sent, events} = await remind(raw);
  assert.equal(sent, 1);
  assert.deepEqual(events.map(e => e.email), ['eligible@example.test']);
});

test('a member who was never nudged is not reminded, and the automatic names are not used as a first name', async () => {
  const {raw} = await world();
  await member(raw, {email: 'never@example.test', hoursAgo: 100});
  assert.equal((await remind(raw)).sent, 0);
  await nudged(raw, {email: 'anon@example.test'}, 72); // no full_name -> "Royal Member"
  const {events} = await remind(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].props.first_name ?? null, null);
});

test('the reminder sweep is service-role only, its table is locked, and the schedule runs it once a day', async () => {
  const {db, as} = await world();
  await as('00000000-0000-4000-8000-0000000000aa');
  await assert.rejects(db.query('select public.send_first_listing_reminders()'), /permission denied/);
  await assert.rejects(db.query('select * from public.first_listing_reminders'), /permission denied/);
  await as('00000000-0000-4000-8000-0000000000aa', 'service_role');
  await db.query('select public.send_first_listing_reminders()');
  const sql = await readFile(new URL('../supabase/migrations/202610150148_first_listing_reminder_schedule.sql', import.meta.url), 'utf8');
  assert.match(sql, /cron\.schedule\('first-listing-reminders', '30 17 \* \* \*'/);
  assert.match(sql, /public\.send_first_listing_reminders\(\)/);
});
