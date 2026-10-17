import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {createHandler} from '../supabase/functions/seo-search-console-sync/handler.js';

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
      language plpgsql as $$ declare new_id bigint; begin insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
  for (const file of MIGRATIONS) { const sql = await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

let n = 0;
const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
const day = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

test('rows are saved once per day, page and search, and saving a day again replaces it', async () => {
  const {db, as, raw} = await freshDb();
  await as(null, 'service_role');
  const row = {day: day(3), page: 'https://credabilia.com/item/a', query: 'sidney crosby signed photo', clicks: 1, impressions: 10, position: 7.5};
  assert.equal((await db.query('select public.seo_ingest_search_rows($1) as n', [JSON.stringify([row])])).rows[0].n, 1);
  await db.query('select public.seo_ingest_search_rows($1)', [JSON.stringify([{...row, clicks: 2, impressions: 12}])]);
  const rows = (await raw('select * from public.seo_search_daily')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].clicks, 2); assert.equal(rows[0].impressions, 12);
  await assert.rejects(() => db.query("select public.seo_ingest_search_rows('{}'::jsonb)"), /list/);
});

test('only the sync job can write search data, and only the operator can read the report', async () => {
  const {db, as, raw} = await freshDb();
  const member = id(), operator = id();
  await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [member, 'member@example.test', operator, 'op@example.test']);
  await raw('insert into public.operators(user_id) values($1)', [operator]);
  await as(member);
  await assert.rejects(() => db.query("select public.seo_ingest_search_rows('[]'::jsonb)"), /permission denied/);
  await assert.rejects(() => db.query('select * from public.seo_search_daily'), /permission denied/);
  await assert.rejects(() => db.query('select public.admin_seo_report()'), /Not authorized/);
  await as(operator);
  const empty = (await db.query('select public.admin_seo_report() as r')).rows[0].r;
  assert.equal(empty.newest_day, null); assert.deepEqual(empty.low_ctr, []); assert.deepEqual(empty.suggestions, []);
});

test('the weekly report compares this week to last, and names the searches and pages to work on', async () => {
  const {db, as, raw} = await freshDb();
  const operator = id(); await raw('insert into auth.users(id,email) values($1,$2)', [operator, 'op@example.test']); await raw('insert into public.operators(user_id) values($1)', [operator]);
  const rows = [
    {day: day(3), page: 'https://credabilia.com/item/a', query: 'frameworth crosby photo', clicks: 0, impressions: 30, position: 6},     // seen, never clicked
    {day: day(3), page: 'https://credabilia.com/category/sports', query: 'sports memorabilia', clicks: 1, impressions: 15, position: 12}, // close to page one
    {day: day(10), page: 'https://credabilia.com/', query: 'credabilia', clicks: 2, impressions: 10, position: 3},                      // the week before
  ];
  await as(null, 'service_role'); await db.query('select public.seo_ingest_search_rows($1)', [JSON.stringify(rows)]);
  await as(operator);
  const report = (await db.query('select public.admin_seo_report() as r')).rows[0].r;
  assert.equal(report.last_7_days.impressions, 45); assert.equal(report.last_7_days.clicks, 1);
  assert.equal(report.previous_7_days.impressions, 10); assert.equal(report.previous_7_days.clicks, 2);
  assert.equal(Number(report.last_7_days.position), 8, 'average position is weighted by views: (6*30 + 12*15) / 45');
  assert.deepEqual(report.low_ctr.map(r => r.query), ['frameworth crosby photo']);
  assert.deepEqual(report.striking_distance.map(r => r.query), ['sports memorabilia']);
  assert.equal(report.top_queries[0].query, 'credabilia'); assert.equal(report.top_queries[0].clicks, 2, 'the search with the most clicks leads, over the 28 days');
  assert.ok(report.suggestions.some(s => s.includes('/item/a') && s.includes('frameworth crosby photo')), 'a plain instruction for the low-click search');
  assert.ok(report.suggestions.some(s => s.includes('/category/sports') && s.includes('close to page one')));
});

test('the report lists public listings too thin to rank, with the reason, and leaves out healthy ones', async () => {
  const {db, as, raw} = await freshDb();
  const operator = id(), seller = id();
  await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [operator, 'op@example.test', seller, 'seller@example.test']); await raw('insert into public.operators(user_id) values($1)', [operator]);
  const make = async (title, description, tags) => (await raw("insert into public.listings(seller_id,title,description,category,price_cents,status,tags) values($1,$2,$3,'Sports',5000,'active',$4) returning id", [seller, title, description, JSON.stringify(tags)])).rows[0].id;
  const thin = await make('Ball', 'Signed ball, good shape.', []);
  const healthy = await make('Mike Tyson Red Everlast Boxing Glove with Handwritten Signature', 'A red Everlast boxing glove with a handwritten signature in black marker, shown in clear photos from several angles.', ['mike tyson']);
  await raw("insert into public.listing_media(listing_id,path,kind,position) values($1,'x/y.jpg','item',0)", [healthy]);
  await as(operator);
  const report = (await db.query('select public.admin_seo_report() as r')).rows[0].r;
  const found = report.listing_issues.find(l => l.id === thin);
  assert.deepEqual([...found.issues].sort(), ['no photo', 'no tags', 'short title', 'thin description']);
  assert.ok(!report.listing_issues.some(l => l.id === healthy));
  assert.ok(report.suggestions.some(s => s.includes('1 public listings')));
});

// ---- the sync function ----
async function serviceAccount() {
  const keys = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
  return JSON.stringify({client_email: 'seo@project.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n'});
}
function harness({secret, google, login}) {
  const calls = {rpc: [], fetch: []};
  const createClient = () => ({rpc: async (name, args) => { calls.rpc.push([name, args]); return {data: name === 'seo_ingest_search_rows' ? args.p_rows.length : null, error: null}; }});
  const fetchFn = async (url, options) => {
    calls.fetch.push([String(url), options]);
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return {ok: true, json: async () => ({access_token: 'tok'})};
    return google(url, options);
  };
  const env = name => ({SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'k', GOOGLE_SC_SERVICE_ACCOUNT_JSON: secret, ...(login ? {GOOGLE_SC_CLIENT_ID: 'cid', GOOGLE_SC_CLIENT_SECRET: 'csecret', GOOGLE_SC_REFRESH_TOKEN: 'rtoken'} : {})}[name]);
  return {calls, handler: createHandler({createClient, env, fetchFn, now: () => new Date('2026-10-17T08:15:00Z')})};
}
const post = (handler, body) => handler(new Request('https://x.test', {method: 'POST', ...(body ? {body: JSON.stringify(body), headers: {'Content-Type': 'application/json'}} : {})}));

test('the sync does nothing but say so until the Google service account is set up', async () => {
  const {calls, handler} = harness({secret: undefined, google: () => { throw new Error('must not call Google'); }});
  const response = await post(handler);
  assert.deepEqual(await response.json(), {configured: false});
  assert.deepEqual(calls.rpc.map(c => [c[0], c[1].p_status]), [['seo_log_sync', 'not_configured']]);
  assert.equal(calls.fetch.length, 0);
});

test('the sync signs in to Google, asks for the last days of search data, and saves each row', async () => {
  const {calls, handler} = harness({secret: await serviceAccount(), google: async () => ({ok: true, json: async () => ({rows: [
    {keys: ['2026-10-14', 'https://credabilia.com/item/a', 'sidney crosby photo'], clicks: 1, impressions: 9, position: 4.2},
    {keys: ['2026-10-14', 'https://credabilia.com/', 'credabilia'], clicks: 2, impressions: 5, position: 1}]})})});
  const response = await post(handler);
  assert.deepEqual(await response.json(), {configured: true, rows: 2});
  const token = calls.fetch[0]; assert.match(token[1].body.get('assertion'), /^[\w-]+\.[\w-]+\.[\w-]+$/, 'a signed three-part token');
  const query = calls.fetch[1]; assert.match(query[0], /sites\/sc-domain%3Acredabilia\.com\/searchAnalytics\/query/);
  assert.equal(query[1].headers.Authorization, 'Bearer tok');
  const sent = JSON.parse(query[1].body); assert.deepEqual(sent.dimensions, ['date', 'page', 'query']);
  assert.equal(sent.startDate, '2026-10-11'); assert.equal(sent.endDate, '2026-10-15', 'ends two days back, when Google has settled');
  const ingest = calls.rpc.find(c => c[0] === 'seo_ingest_search_rows')[1].p_rows;
  assert.deepEqual(ingest[0], {day: '2026-10-14', page: 'https://credabilia.com/item/a', query: 'sidney crosby photo', clicks: 1, impressions: 9, position: 4.2});
  assert.deepEqual(calls.rpc.at(-1), ['seo_log_sync', {p_status: 'ok', p_rows: 2, p_note: '2026-10-11 to 2026-10-15'}]);
});

test('a Google error is logged as failed and never reported as success', async () => {
  const {calls, handler} = harness({secret: await serviceAccount(), google: async () => ({ok: false, status: 403, json: async () => ({error: {message: 'User does not have sufficient permission for site'}})})});
  const response = await post(handler);
  assert.equal(response.status, 502);
  const log = calls.rpc.at(-1); assert.equal(log[1].p_status, 'failed'); assert.match(log[1].p_note, /sufficient permission/);
});

test('the sync schedule is its own migration and the function never calls Google with anything but read access', async () => {
  const schedule = await readFile(new URL('../supabase/migrations/202610170153_seo_sync_schedule.sql', import.meta.url), 'utf8');
  assert.match(schedule, /cron\.schedule\('seo-search-console-sync', '15 8 \* \* \*'/);
  const source = await readFile(new URL('../supabase/functions/seo-search-console-sync/handler.js', import.meta.url), 'utf8');
  assert.ok(source.includes('webmasters.readonly') && !source.includes("scope: 'https://www.googleapis.com/auth/webmasters'"), 'read-only scope');
});

test('the admin dashboard has an SEO tab that reads the weekly report', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'), service = await readFile(new URL('../src/service.js', import.meta.url), 'utf8');
  assert.ok(app.includes("onClick={() => setTab('seo')}>SEO</button>") && app.includes("{tab === 'seo' && <AdminSeo/>}"));
  assert.ok(app.includes('service.adminSeoReport()') && service.includes("client.rpc('admin_seo_report')"));
  assert.ok(app.includes('Google access is not connected yet'), 'it says plainly when the data source is not connected');
});

test('the sync can sign in with your own Google login (a saved refresh token) instead of a service account key', async () => {
  const {calls, handler} = harness({secret: undefined, login: true, google: async () => ({ok: true, json: async () => ({rows: [{keys: ['2026-10-14', 'https://credabilia.com/', 'credabilia'], clicks: 2, impressions: 5, position: 1}]})})});
  const response = await post(handler);
  assert.deepEqual(await response.json(), {configured: true, rows: 1});
  const token = calls.fetch[0][1].body;
  assert.equal(token.get('grant_type'), 'refresh_token'); assert.equal(token.get('client_id'), 'cid'); assert.equal(token.get('refresh_token'), 'rtoken');
  assert.equal(calls.fetch[1][1].headers.Authorization, 'Bearer tok');
  assert.equal(calls.rpc.at(-1)[1].p_status, 'ok');
});

test('a login that is only half saved is treated as not set up, never as an error', async () => {
  const calls = [];
  const handler = createHandler({createClient: () => ({rpc: async (n, a) => { calls.push([n, a]); return {data: null, error: null}; }}), env: name => ({GOOGLE_SC_CLIENT_ID: 'cid'}[name]), fetchFn: () => { throw new Error('must not call Google'); }});
  assert.deepEqual(await (await post(handler)).json(), {configured: false});
  assert.equal(calls[0][1].p_status, 'not_configured');
});

test('a one-off catch-up can read a longer stretch of history, within a limit', async () => {
  const startDate = async body => { const {calls, handler} = harness({secret: undefined, login: true, google: async () => ({ok: true, json: async () => ({rows: []})})}); await post(handler, body); return JSON.parse(calls.fetch[1][1].body).startDate; };
  assert.equal(await startDate(), '2026-10-11', 'the daily run reads the last few days');
  assert.equal(await startDate({days: 60}), '2026-08-18');
  assert.equal(await startDate({days: 100000}), '2026-06-19', 'capped at 120 days');
  assert.equal(await startDate({days: 'abc'}), '2026-10-11', 'nonsense falls back to the daily window');
});
