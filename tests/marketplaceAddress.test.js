import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware, clearSeoCache} = await import('../middleware.js');
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('/marketplace goes to the home page instead of showing "Store not found", and the redirect is not permanent so the address can become a real page later', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const rule = config.redirects.find(r => r.source === '/marketplace');
  assert.deepEqual(rule, {source: '/marketplace', destination: '/', permanent: false});
  assert.ok(config.redirects.some(r => r.has?.some(h => h.value === 'www.credabilia.com')), 'the existing www redirect is untouched');
});

test('the search layer never looks "marketplace" up as a store name', async () => {
  clearSeoCache();
  const requested = [], original = globalThis.fetch;
  globalThis.fetch = async url => { requested.push(String(url)); return {ok: true, json: async () => null, text: async () => '<html><head><title>Credabilia | The Memorabilia Kingdom</title></head><body><div id="root"></div></body></html>'}; };
  try {
    await middleware(new Request('https://credabilia.com/marketplace', {headers: {'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)'}}));
    assert.equal(requested.some(url => /get_storefront/.test(url)), false);
  } finally { globalThis.fetch = original; }
});

test('no seller can claim "marketplace" as a store name, and the reserved list is patched without losing the others', async () => {
  const sql = await read('supabase/migrations/202610280168_reserve_marketplace_slug.sql');
  assert.match(sql, /'podcast'',''marketplace'/);
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  const db = new PGlite({extensions: {vector}});
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
  for (const file of migrations) { const text = await read('supabase/migrations/' + file); if (/cron.(un)?schedule/.test(text)) continue; await db.exec(text); }
  const user = '99999999-0000-4000-8000-0000000000cc';
  await db.exec('reset role');
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [user, 'seller@example.test']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role authenticated');
  for (const reserved of ['marketplace', 'podcast', 'giveaway-rules', 'founding', 'category', 'certificate', 'help']) {
    await assert.rejects(db.query('select public.update_store_slug($1)', [reserved]), /reserved/, reserved + ' stays reserved');
  }
  await db.query("select public.update_store_slug('marketplace-cards')");
});
