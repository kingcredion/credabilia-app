import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {ISSUERS, LOOKUP_ISSUERS, certificateInput, certificateSuggestion, resolveIssuer} from '../src/certificates.js';
import {credibilityScore} from '../src/credibility.js';

const NEW = {tag: 75, sia: 70, meigray: 70, mears: 72, resolution: 72};
const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('each new issuer is found by its common names, has no lookup, sits between Other and the checkable issuers, and is counted in full', () => {
  const names = {tag: ['TAG', 'TAG Grading', 'Technical Authentication & Grading'], sia: ['SIA', 'SIA Photo Match', 'Sports Investors Authentication'], meigray: ['MeiGray', 'MeiGray Authenticated', 'MeiGray Group'],
    mears: ['MEARS', 'MEARS Authentication', 'Memorabilia Evaluation and Research Services'], resolution: ['Resolution', 'ResMatch', 'Resolution Photomatching']};
  for (const [id, rating] of Object.entries(NEW)) {
    const issuer = resolveIssuer(id);
    assert.equal(issuer.id, id); assert.equal(issuer.rating, rating, id + ' rating');
    assert.equal(issuer.lookup, null); assert.equal(issuer.noLookup, true, id + ' has no public lookup');
    assert.match(issuer.website, /^https:\/\//); assert.ok(['game_used', 'card_grade'].includes(issuer.kind), id + ' says what kind of evidence it is');
    assert.ok(issuer.howToCheck.length > 30, id + ' tells a buyer what they can actually do');
    assert.ok(issuer.rating > resolveIssuer('other').rating && issuer.rating < resolveIssuer('tristar').rating, id + ' is between Other and the issuers we can check');
    assert.ok(issuer.rating >= resolveIssuer('frameworth').rating, id + ' is not below an issuer that makes its own items');
    for (const name of names[id]) assert.equal(resolveIssuer(name)?.id, id, name + ' resolves to ' + id);
    assert.equal(certificateSuggestion({issuer: names[id][0], certificate_number: 'A-1'}).certificate_issuer, id, 'an AI reading of the printed issuer maps to it');
    assert.deepEqual(certificateInput({certificate_issuer: names[id][0], certificate_number: 'A-1'}), {certificate_issuer: id, certificate_number: 'A-1', certificate_company: null});
    assert.ok(!LOOKUP_ISSUERS.some(i => i.id === id), 'its numbers are not searched as if they were serials');
    const base = {certificate_issuer: id, certificate_number: 'A-1'};
    assert.equal(credibilityScore(base).certificate_score, rating, 'counted in full, not cut to 75%');
    assert.equal(credibilityScore({...base, certificate_checked_at: '2026-10-28'}).certificate_score, rating);
  }
  assert.equal(ISSUERS.filter(i => i.kind === 'game_used').length, 4);
  assert.equal(credibilityScore({certificate_issuer: 'psa', certificate_number: 'X1'}).certificate_score, 71, 'a checkable issuer still takes the 75% until checked');
});

test('every new profile says who they are, what we looked at and could not check, why the rating is what it is, when it was reviewed, and marks the company\'s own claims', () => {
  for (const id of Object.keys(NEW)) {
    const {profile} = resolveIssuer(id);
    assert.match(profile.reviewed, /^2026-10-28$/, id + ' review date');
    assert.ok(profile.summary.length > 80, id + ' summary');
    assert.ok(profile.looked.length >= 3 && profile.couldnt.length >= 3, id + ' has both halves of the due diligence');
    assert.match(profile.why, new RegExp(NEW[id] + ' out of 100'), id + ' states its own rating');
    assert.match(profile.why, /not a verdict on any single/, id);
    assert.ok(profile.couldnt.some(line => /public lookup|search page|online lookup/i.test(line)), id + ' says plainly what cannot be checked');
    assert.match(profile.looked.join(' '), /company's own|own statements|By its own|by its own/i, id + ': a claim is marked as the company\'s own');
  }
});

test('profiles state only what the research supports and repeat no allegation', () => {
  const text = id => JSON.stringify(resolveIssuer(id).profile);
  assert.match(text('meigray'), /founded in 1997 by Barry Meisel and Bob Gray/);
  assert.match(text('meigray'), /\$24\.12 million/); assert.match(text('meigray'), /withdrew a letter/);
  assert.match(text('meigray'), /said it had been given counterfeit documentation/, 'the 2023 case is the company\'s own account, attributed');
  assert.match(text('mears'), /2004/); assert.match(text('mears'), /Troy Kinunen/); assert.match(text('mears'), /did not confirm either independently/);
  assert.match(text('resolution'), /three times, in 2019, 2021 and 2022/); assert.match(text('resolution'), /Match ID/);
  assert.match(text('tag'), /1,000-point/); assert.match(text('tag'), /QR code/);
  assert.match(text('sia'), /siaphotomatch\.com/); assert.match(text('sia'), /does not load fully|would not load fully/);
  for (const id of Object.keys(NEW)) assert.doesNotMatch(text(id), /\b(scam|fraudster|arrest|fake|forger)/i, id + ': no allegation is repeated');
  assert.match(resolveIssuer('mears').profile.summary, /separate auction business/);
});

async function freshDb() {
  const db = new PGlite({extensions: {vector}});
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
  for (const file of MIGRATIONS) { const sql = await read('supabase/migrations/' + file); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  return db;
}

test('the database agrees on every rating, counts these issuers in full, accepts them without a company name, and leaves them off the operator check list', async () => {
  const db = await freshDb();
  for (const issuer of ISSUERS) assert.equal((await db.query('select public.certificate_rating($1) as r', [issuer.id])).rows[0].r, issuer.rating, issuer.id + ' matches the app');
  const credit = async (issuer, checked) => (await db.query('select public.certificate_credit($1,$2,$3) as c', [issuer, 'A-1', checked])).rows[0].c;
  for (const [id, rating] of Object.entries(NEW)) { assert.equal(await credit(id, null), rating, id); assert.equal(await credit(id, '2026-10-28'), rating, id + ' checked'); }
  assert.equal(await credit('psa', null), 71, 'unchecked PSA is still 75% of 95');

  const seller = '00000000-0000-4000-8000-0000000000e1', operator = '00000000-0000-4000-8000-0000000000e2';
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', operator, 'o@example.test']);
  await db.query('insert into public.operators(user_id) values($1)', [operator]);
  const insert = (issuer, number, company) => db.query("insert into public.listings(seller_id,title,description,category,price_cents,status,certificate_issuer,certificate_number,certificate_company) values($1,'Game-used jersey','A game-used jersey for testing the certificate rules.','Sports',9900,'active',$2,$3,$4) returning id", [seller, issuer, number, company]);
  const ids = {};
  for (const id of Object.keys(NEW)) ids[id] = (await insert(id, 'A-1', null)).rows[0].id;
  await insert('psa', 'ABC123', null);
  for (const id of Object.keys(NEW)) await assert.rejects(() => insert(id, 'A-1', 'Some Company'), /certificate_details_valid/, id + ': a named company belongs only to "Other"');
  await assert.rejects(() => insert('notanissuer', 'A-1', null), /certificate_details_valid/);

  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]); await db.exec('set role authenticated');
  const list = (await db.query('select public.admin_list_certificates_to_check() as l')).rows[0].l;
  for (const id of Object.keys(NEW)) assert.ok(!list.some(r => r.listing_id === ids[id]), id + ' is not on the operator list');
  assert.ok(list.some(r => r.issuer === 'psa'), 'a checkable issuer still is');
});

test('a listing that named one of them as Other is moved to the real issuer, and a different company is left alone', async () => {
  const sql = await read('supabase/migrations/202610280167_game_used_issuers.sql');
  for (const id of Object.keys(NEW)) assert.match(sql, new RegExp("set certificate_issuer='" + id + "', certificate_company=null"), id + ' backfill');
  assert.match(sql, /lower\(btrim\(certificate_company\)\) in \(/, 'exact names only, so "Tagged Collectibles" is never moved');
  const db = await freshDb();
  // Replay just the backfill logic against rows made before the migration would have run.
  await db.exec('reset role');
  const seller = '00000000-0000-4000-8000-0000000000e3';
  await db.query('insert into auth.users(id,email) values($1,$2)', [seller, 's3@example.test']);
  await db.exec('alter table public.listings drop constraint certificate_details_valid');
  const row = async company => (await db.query("insert into public.listings(seller_id,title,description,category,price_cents,status,certificate_issuer,certificate_number,certificate_company) values($1,'Item','An item for testing the backfill.','Sports',9900,'active','other','A-1',$2) returning id", [seller, company])).rows[0].id;
  const a = await row('MeiGray Group'), b = await row('Tagged Collectibles'), c = await row('  sia photo match ');
  const backfill = sql.slice(sql.indexOf('update public.listings'), sql.indexOf('alter table public.listings add constraint'));
  await db.exec(backfill);
  const issuerOf = async id => (await db.query('select certificate_issuer as i, certificate_company as c from public.listings where id=$1', [id])).rows[0];
  assert.deepEqual(await issuerOf(a), {i: 'meigray', c: null});
  assert.deepEqual(await issuerOf(b), {i: 'other', c: 'Tagged Collectibles'});
  assert.deepEqual(await issuerOf(c), {i: 'sia', c: null});
});

test('the item page says what a buyer can do for an issuer with no lookup, never claims a lookup exists, and shows when the profile was reviewed', async () => {
  const details = await read('src/CertificateDetails.jsx'), cred = await read('src/CredibilityDetails.jsx');
  assert.ok(details.includes('if (issuer.noLookup) return') && details.includes('{issuer.howToCheck && <p className="field-note"><strong>How to check:</strong> {issuer.howToCheck}</p>}'));
  assert.ok(details.includes('{issuer.name} has no public lookup that Credabilia can use'), 'the note is for every issuer, not only Frameworth');
  assert.ok(details.includes("resolveIssuer(issuer)?.noLookup && <p className=\"field-note\">{resolveIssuer(issuer).name} has no public lookup"), 'and so is the note in the seller form');
  assert.ok(cred.includes('profile.reviewed && <p className="field-note">Reviewed '));
  assert.match(cred, /such as Frameworth Sports Marketing, MeiGray or Resolution Photomatching/);
});

test('every issuer the app knows is one the database allows, so a seller can never pick one the database refuses', async () => {
  const sql = await read('supabase/migrations/202610280167_game_used_issuers.sql');
  const allowed = sql.match(/certificate_issuer in \(([^)]*)\)/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
  for (const issuer of ISSUERS.filter(i => !i.noNumber)) assert.ok(allowed.includes(issuer.id), issuer.id + ' is allowed by the database');
  for (const id of allowed) assert.ok(ISSUERS.some(i => i.id === id), id + ' exists in the app');
});
