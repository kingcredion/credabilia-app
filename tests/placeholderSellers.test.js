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
      language plpgsql as $$ declare new_id bigint; begin insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
  for (const file of MIGRATIONS) { const sql = await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

let n = 0;
const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
async function member(raw, email) {
  const uid = id();
  await raw('insert into auth.users(id,email) values($1,$2)', [uid, email]);
  return uid;
}
async function listing(raw, seller, title, ageHours) {
  const r = await raw("insert into public.listings(seller_id,title,description,category,price_cents,status,created_at) values($1,$2,'A fictional listing for testing only, with enough text to count as a description.','Sports',12500,'active',now()-($3||' hours')::interval) returning id", [seller, title, String(ageHours)]);
  return r.rows[0].id;
}

test('a placeholder seller\'s items sit below every real seller\'s items, even when they are newer, and paging keeps that order', async () => {
  const {raw, as} = await freshDb();
  const placeholder = await member(raw, 'placeholder@example.test'), real = await member(raw, 'real@example.test');
  await raw("insert into public.placeholder_sellers(seller_id) values($1)", [placeholder]);
  // The placeholder items are the newest on the site; the real seller's are older.
  await listing(raw, placeholder, 'Placeholder newest', 1);
  await listing(raw, placeholder, 'Placeholder second', 2);
  await listing(raw, real, 'Real recent', 30);
  await listing(raw, real, 'Real old', 400);

  await as(null, 'anon');
  const feed = (await raw("select public.browse_listings_with_certificates() as f")).rows[0].f;
  assert.deepEqual(feed.map(i => i.title), ['Real recent', 'Real old', 'Placeholder newest', 'Placeholder second']);
  assert.ok(feed.every(i => i.created_at && i.sort_at), 'the real date is kept for display and sort_at is the paging key');
  assert.ok(new Date(feed[0].sort_at).getTime() === new Date(feed[0].created_at).getTime(), 'a real seller\'s sort_at is their real date');

  // Paging from the last real item continues into the placeholders, and paging from inside the placeholders continues within them.
  const afterReal = (await raw("select public.browse_listings_with_certificates(300,$1,$2) as f", [feed[1].sort_at, feed[1].id])).rows[0].f;
  assert.deepEqual(afterReal.map(i => i.title), ['Placeholder newest', 'Placeholder second']);
  const afterFirstPlaceholder = (await raw("select public.browse_listings_with_certificates(300,$1,$2) as f", [feed[2].sort_at, feed[2].id])).rows[0].f;
  assert.deepEqual(afterFirstPlaceholder.map(i => i.title), ['Placeholder second']);
  const small = (await raw("select public.browse_listings_with_certificates(2) as f")).rows[0].f;
  assert.deepEqual(small.map(i => i.title), ['Real recent', 'Real old'], 'a small page is filled with real sellers first');
});

test('the crawler lists follow the same rule, and removing the placeholder row restores date order', async () => {
  const {raw} = await freshDb();
  const placeholder = await member(raw, 'placeholder@example.test'), real = await member(raw, 'real@example.test');
  await raw("update public.profiles set slug='ph' where id=$1", [placeholder]);
  await raw("update public.profiles set slug='real' where id=$1", [real]);
  await raw("insert into public.placeholder_sellers(seller_id) values($1)", [placeholder]);
  await listing(raw, placeholder, 'Placeholder newest', 1);
  await listing(raw, real, 'Real older', 50);
  const titles = async () => (await raw("select public.seo_listing_index(null,60,null) as r")).rows[0].r.map(i => i.title);
  assert.deepEqual(await titles(), ['Real older', 'Placeholder newest']);
  await raw("delete from public.placeholder_sellers");
  assert.deepEqual(await titles(), ['Placeholder newest', 'Real older']);
});

test('no signed-in member can read or change who is a placeholder', async () => {
  const {db, raw, as} = await freshDb();
  const someone = await member(raw, 'someone@example.test');
  await as(someone);
  await assert.rejects(() => db.query("select * from public.placeholder_sellers"), /permission denied/);
  await assert.rejects(() => db.query("insert into public.placeholder_sellers(seller_id) values($1)", [someone]), /permission denied/);
});
