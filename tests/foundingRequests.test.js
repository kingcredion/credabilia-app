import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {approvalMailto, FOUNDING_TERMS} from '../src/founding.js';

const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');

async function freshDb() {
  const db = new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
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
  return {db, as, raw};
}

const OP = '00000000-0000-4000-8000-0000000000a1', STRANGER = '11111111-1111-4111-8111-111111111111';
const ask = (db, over = {}) => db.query('select public.submit_founding_request($1,$2,$3,$4,$5,$6,$7) as r',
  [over.email ?? 'shop@example.test', over.name ?? 'Pat Collector', over.business ?? 'Pat\'s Cards', over.link ?? 'https://instagram.com/patscards', over.sells ?? 'Signed baseballs', over.heard ?? 'Google ad', over.website ?? null]);

async function world({started = true} = {}) {
  const ctx = await freshDb(); const {db, as, raw} = ctx;
  await raw('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())', [OP, 'operator@example.test', STRANGER, 'stranger@example.test']);
  await raw('insert into public.operators(user_id) values($1)', [OP]);
  if (started) { await as(OP); await db.query('select public.admin_start_founding_campaign()'); }
  ctx.pending = async () => (await raw("select count(*)::int n from public.founding_requests where status='pending'")).rows[0].n;
  return ctx;
}

test('the requests are private: nobody can read the table, and only the open/closed answer is public', async () => {
  const {db, as, raw} = await world();
  for (const [actor, role] of [[null, 'anon'], [STRANGER, 'authenticated']]) {
    await as(actor, role);
    await assert.rejects(db.query('select * from public.founding_requests'), /permission denied/i, role + ' cannot read the table');
    await assert.rejects(db.query("insert into public.founding_requests(email_normalized,email,contact_name,business_name) values('a@b.co','a@b.co','A','B')"), /permission denied/i);
  }
  await as(null, 'anon');
  const info = (await db.query('select public.founding_open_info() as r')).rows[0].r;
  assert.deepEqual(info, {open: true, spots_left: 100});
  assert.equal((await raw('select count(*)::int n from public.founding_requests')).rows[0].n, 0);
});

test('requests are refused until the campaign has started, and the open answer says so', async () => {
  const {db, as} = await world({started: false});
  await as(null, 'anon');
  assert.deepEqual((await db.query('select public.founding_open_info() as r')).rows[0].r, {open: false, spots_left: null});
  await assert.rejects(ask(db), /not taking requests/);
});

test('anyone can ask, the details are checked, and a bot that fills the hidden field is silently ignored', async () => {
  const {db, as, pending} = await world();
  await as(null, 'anon');
  assert.deepEqual((await ask(db)).rows[0].r, {received: true});
  assert.equal(await pending(), 1);
  await assert.rejects(ask(db, {email: 'not-an-email'}), /valid email/);
  await assert.rejects(ask(db, {name: '   '}), /your name/);
  await assert.rejects(ask(db, {business: ''}), /shop or business/);
  await assert.rejects(ask(db, {email: 'x@y.test', sells: 'x'.repeat(501)}), /too long/);
  assert.deepEqual((await ask(db, {email: 'bot@example.test', website: 'http://spam.test'})).rows[0].r, {received: true}, 'looks the same to a bot');
  assert.equal(await pending(), 1, 'and stores nothing');
});

test('asking twice, or asking with an address that is already invited, answers the same way and stores nothing new', async () => {
  const {db, as, raw, pending} = await world();
  await as(OP); await db.query("select public.admin_founding_import($1)", [JSON.stringify([{email: 'already.invited@gmail.com', name: 'Inv', business: 'Invited Shop'}])]);
  await as(null, 'anon');
  await ask(db, {email: 'Shop@Example.test'});
  assert.deepEqual((await ask(db, {email: 'shop+ad@example.test'})).rows[0].r, {received: true}, 'a repeat looks identical');
  assert.deepEqual((await ask(db, {email: 'already.invited+x@gmail.com'})).rows[0].r, {received: true}, 'the form cannot reveal who is on the list');
  assert.deepEqual((await ask(db, {email: 'alreadyinvited@googlemail.com'})).rows[0].r, {received: true});
  assert.equal(await pending(), 1, 'one stored request, none for the invited address');
  assert.equal((await raw("select count(*)::int n from public.founding_requests where email_normalized like 'already%'")).rows[0].n, 0);
});

test('a flood is held back: too many in an hour is refused politely', async () => {
  const {db, as, raw} = await world();
  await raw("insert into public.founding_requests(email_normalized,email,contact_name,business_name) select 'n'||g||'@example.test','n'||g||'@example.test','N','B' from generate_series(1,100) g");
  await as(null, 'anon');
  await assert.rejects(ask(db, {email: 'late@example.test'}), /a lot of requests/);
});

test('only operators can list or decide; approving adds the invitation and the person can then claim it; declining adds nothing', async () => {
  const {db, as, raw} = await world();
  await as(null, 'anon'); await ask(db, {email: 'yes@example.test', business: 'Yes Shop'}); await ask(db, {email: 'no@example.test', business: 'No Shop'});
  await as(STRANGER);
  await assert.rejects(db.query("select public.admin_founding_requests('pending',50)"), /Operators only/);
  await as(OP);
  const list = (await db.query("select public.admin_founding_requests('pending',50) as r")).rows[0].r;
  assert.equal(list.length, 2);
  const yes = list.find(r => r.business_name === 'Yes Shop'), no = list.find(r => r.business_name === 'No Shop');
  await as(STRANGER);
  await assert.rejects(db.query('select public.admin_founding_decide_request($1,true)', [yes.id]), /Operators only/);

  await as(OP);
  const before = (await db.query('select public.admin_founding_overview() as r')).rows[0].r;
  assert.equal(before.requests_pending, 2);
  assert.deepEqual((await db.query('select public.admin_founding_decide_request($1,true) as r', [yes.id])).rows[0].r, {status: 'approved', email: 'yes@example.test'});
  assert.deepEqual((await db.query('select public.admin_founding_decide_request($1,false) as r', [no.id])).rows[0].r, {status: 'declined', email: 'no@example.test'});
  await assert.rejects(db.query('select public.admin_founding_decide_request($1,true)', [yes.id]), /already reviewed/);
  const after = (await db.query('select public.admin_founding_overview() as r')).rows[0].r;
  assert.deepEqual([after.requests_pending, after.requests_approved, after.requests_declined], [0, 1, 1]);
  assert.equal(after.invitations_loaded, before.invitations_loaded + 1);
  assert.equal((await raw("select count(*)::int n from public.founding_invitations where email_normalized='no@example.test'")).rows[0].n, 0, 'declined: no invitation');

  const claimer = '44444444-4444-4444-8444-444444444444';
  await raw('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [claimer, 'yes@example.test']);
  await as(claimer);
  assert.equal((await db.query('select public.claim_founding_spot() as r')).rows[0].r.claimed, true, 'the approved person claims through the normal path');
  const noOne = '55555555-5555-4555-8555-555555555555';
  await raw('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [noOne, 'no@example.test']);
  await as(noOne);
  await assert.rejects(db.query('select public.claim_founding_spot()'), /no Founding 100 invitation/i);
});

test('once the window has ended, nothing new is accepted or approved, and the cleanup deletes the requests', async () => {
  const {db, as, raw} = await world();
  await as(null, 'anon'); await ask(db, {email: 'last@example.test'});
  const id = (await raw("select id from public.founding_requests where email_normalized='last@example.test'")).rows[0].id;
  await raw("update public.founding_campaign set expires_at=now()-interval '1 minute' where id=1");
  await as(null, 'anon');
  await assert.rejects(ask(db, {email: 'toolate@example.test'}), /not taking requests/);
  await as(OP);
  await assert.rejects(db.query('select public.admin_founding_decide_request($1,true)', [id]), /closed/);
  await as(OP, 'service_role'); await db.query('select public.purge_expired_founding_invitations()');
  assert.equal((await raw('select count(*)::int n from public.founding_requests')).rows[0].n, 0, 'the details are not kept');
});

test('the page offers the form to visitors and to signed-in people without an invitation, never in the phone apps, and the approval email is right', async () => {
  const legal = squash(await read('src/Legal.jsx')), form = squash(await read('src/FoundingRequest.jsx')), admin = squash(await read('src/AdminFounding.jsx')), service = squash(await read('src/service.js'));
  assert.match(legal, /import \{ FoundingRequestForm \} from '\.\/FoundingRequest\.jsx';/);
  assert.match(legal, /\{!webOnly && view === 'signed-out' && <>[\s\S]*<FoundingRequestForm service=\{service\}\/>[\s\S]*Already invited\? Claim your spot/, 'visitors see the form first and the claim box second');
  assert.match(legal, /\{!webOnly && view === 'not-invited' && <FoundingRequestForm service=\{service\} defaultEmail=/, 'a signed-in person without an invitation can ask too');
  assert.match(legal, /info\.open \? 'signed-out' : 'closed'/, 'a visitor sees the closed page when it is not taking people');
  assert.match(form, /className="founding-hp" aria-hidden="true"/, 'the hidden trap field is there');
  assert.match(form, /trackEvent\('founding_request'\)/);
  assert.match(form, /Privacy Policy/);
  assert.match(admin, /decide\(r, true\)/); assert.match(admin, /decide\(r, false\)/);
  for (const rpc of ['founding_open_info', 'submit_founding_request', 'admin_founding_requests', 'admin_founding_decide_request']) assert.match(service, new RegExp(`rpc\\('${rpc}'`), rpc);
  assert.match(FOUNDING_TERMS.join(' '), /anyone who visits the Founding page can also ask to be considered/);

  const mail = approvalMailto({contact_name: 'Pat Collector', email: 'pat+ad@example.test', business_name: 'Pats'});
  assert.match(mail, /^mailto:pat%2Bad%40example\.test\?subject=/);
  const body = decodeURIComponent(mail.split('&body=')[1]);
  assert.match(body, /^Hi Pat,/);
  assert.match(body, /credabilia\.com\/founding/);
  assert.match(body, /\(pat\+ad@example\.test\)/);
  assert.match(body, /Hide My Email/);
  assert.match(body, /Stripe's normal payment-processing fees still apply/);
  assert.doesNotMatch(body, /free|guarantee/i, 'no promises beyond the approved wording');
});

test('a request remembers a short clean source label, which only staff can see', async () => {
  const {db, as} = await world();
  await as(null, 'anon');
  await db.query("select public.submit_founding_request('ad@example.test','Ad Person','Ad Shop',null,null,null,null,'instagram/founding100')");
  await db.query("select public.submit_founding_request('odd@example.test','Odd Person','Odd Shop',null,null,null,null,$1)", ['<script>alert(1)</script>meta' + 'x'.repeat(200)]);
  await ask(db, {email: 'plain@example.test'});
  await as(OP);
  const rows = (await db.query("select public.admin_founding_requests('pending',50) as r")).rows[0].r;
  const by = email => rows.find(r => r.email === email);
  assert.equal(by('ad@example.test').source, 'instagram/founding100');
  assert.equal(by('plain@example.test').source, null, 'older callers that send no source still work');
  const odd = by('odd@example.test').source;
  assert.doesNotMatch(odd, /[<>()]/, 'only plain label characters are kept');
  assert.ok(odd.length <= 100);
});

test('the request form never decides anything about money', async () => {
  const form = squash(await read('src/FoundingRequest.jsx'));
  assert.doesNotMatch(form, /fee_cents|platform_fee|checkout|purchase/i);
});
