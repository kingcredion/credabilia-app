import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {ISSUERS, LOOKUP_ISSUERS, certificateInput, resolveIssuer} from '../src/certificates.js';
import {credibilityScore} from '../src/credibility.js';

const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();

test('Frameworth is a known issuer: found by its short name, no lookup, rated 65 and counted in full', () => {
  const issuer = resolveIssuer('Frameworth');
  assert.equal(issuer.id, 'frameworth'); assert.equal(issuer.name, 'Frameworth Sports Marketing'); assert.equal(issuer.rating, 65);
  assert.equal(issuer.lookup, null); assert.equal(issuer.noLookup, true); assert.match(issuer.website, /^https:\/\/frameworth\.com/);
  assert.ok(issuer.rating > resolveIssuer('other').rating && issuer.rating < resolveIssuer('tristar').rating, 'between Other and the issuers we can check');
  assert.deepEqual(certificateInput({certificate_issuer: 'Frameworth', certificate_number: '62-044'}), {certificate_issuer: 'frameworth', certificate_number: '62-044', certificate_company: null});
  assert.ok(!LOOKUP_ISSUERS.some(i => i.id === 'frameworth'), 'its numbers are not searched as if they were serials');
  assert.ok(ISSUERS.some(i => i.id === 'frameworth'));
});

test('a Frameworth number is not cut to 75% on top of its lower rating, checked or not', () => {
  const base = {certificate_issuer: 'frameworth', certificate_number: '62-044'};
  assert.equal(credibilityScore(base).certificate_score, 65);
  assert.equal(credibilityScore({...base, certificate_checked_at: '2026-10-17'}).certificate_score, 65);
  assert.equal(credibilityScore({certificate_issuer: 'bas', certificate_number: 'X1'}).certificate_score, 70, 'a checkable issuer still takes the 75% until checked');
  assert.equal(credibilityScore({certificate_issuer: 'other', certificate_company: 'Somebody', certificate_number: 'X1'}).certificate_score, 38);
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
  for (const file of MIGRATIONS) { const sql = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  return db;
}

test('the database agrees: rating 65, counted in full, accepted without a company name, and left out of the operator check list', async () => {
  const db = await freshDb();
  const rating = (await db.query("select public.certificate_rating('frameworth') as r")).rows[0].r;
  assert.equal(rating, 65);
  const credit = async (issuer, checked) => (await db.query('select public.certificate_credit($1,$2,$3) as c', [issuer, '62-044', checked])).rows[0].c;
  assert.equal(await credit('frameworth', null), 65); assert.equal(await credit('frameworth', '2026-10-17'), 65);
  assert.equal(await credit('bas', null), 70, 'unchecked Beckett is still 75% of 93');

  const seller = '00000000-0000-4000-8000-0000000000f1', operator = '00000000-0000-4000-8000-0000000000f2';
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', operator, 'o@example.test']);
  await db.query('insert into public.operators(user_id) values($1)', [operator]);
  const insert = (issuer, number, company) => db.query("insert into public.listings(seller_id,title,description,category,price_cents,status,certificate_issuer,certificate_number,certificate_company) values($1,'Framed signed photo','A framed signed photo for testing the certificate rules.','Sports',9900,'active',$2,$3,$4) returning id", [seller, issuer, number, company]);
  const frame = (await insert('frameworth', '62-044', null)).rows[0].id;
  await insert('psa', 'ABC123', null);
  await assert.rejects(() => insert('frameworth', '62-044', 'Frameworth'), /certificate_details_valid/, 'a named company belongs only to "Other"');

  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]); await db.exec('set role authenticated');
  const list = (await db.query('select public.admin_list_certificates_to_check() as l')).rows[0].l;
  assert.ok(!list.some(r => r.listing_id === frame) && list.some(r => r.issuer === 'psa'), 'Frameworth is not on the list; a checkable issuer still is');
});

test('a listing that named Frameworth as Other is moved to the real issuer by the migration', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610170156_frameworth_issuer.sql', import.meta.url), 'utf8');
  assert.match(sql, /update public\.listings set certificate_issuer='frameworth', certificate_company=null\s+where certificate_issuer='other' and certificate_company ilike 'frameworth%'/);
});

test('the item page tells buyers about the company and links to its website instead of a lookup, and says plainly why it is rated lower', async () => {
  const details = await readFile(new URL('../src/CertificateDetails.jsx', import.meta.url), 'utf8'), cred = await readFile(new URL('../src/CredibilityDetails.jsx', import.meta.url), 'utf8');
  assert.ok(details.includes('if (issuer.noLookup) return') && details.includes('href={issuer.website}') && details.includes('href={issuer.authenticityPage}'));
  assert.ok(details.includes('has no public lookup, so Credabilia cannot check this number'), 'the reason for the lower rating');
  assert.ok(details.includes('On its own website it says'), "the company's claims are marked as its own");
  assert.ok(cred.includes("item.certificate_issuer==='frameworth'") && cred.includes('Frameworth is rated 65 out of 100'));
  assert.doesNotMatch(details, /NHL|guarantee/, 'no claim we cannot back up');
});
