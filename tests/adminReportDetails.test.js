import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

import {readdir} from 'node:fs/promises';
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

const OPERATOR = 'a9028fe8-c514-47bd-a873-ccd78251783a';
const SELLER = '11111111-1111-4111-8111-111111111111', BUYER = '22222222-2222-4222-8222-222222222222', OTHER = '33333333-3333-4333-8333-333333333333';

async function setup() {
  const t = await freshDb();
  const {db, as, raw} = t;
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8)', [SELLER,'seller@example.test',BUYER,'buyer@example.test',OTHER,'other@example.test',OPERATOR,'kingcredion@credabilia.com']);
  await raw('insert into public.operators(user_id) values ($1) on conflict do nothing', [OPERATOR]);
  await raw("update public.profiles set display_name='Randy Seller', slug='randyseller' where id=$1", [SELLER]);
  await raw("update public.profiles set display_name='Pat Buyer' where id=$1", [BUYER]);
  const listing = (await raw("insert into public.listings(seller_id,title,description,category,price_cents,status) values($1,'Signed helmet','A signed helmet used only to test report details.','Sports',12500,'active') returning id", [SELLER])).rows[0].id;
  return {...t, listing};
}
const reports = async (t) => { await t.as(OPERATOR); return (await t.db.query('select public.admin_list_reports($1) as r', ['open'])).rows[0].r; };

test('a listing report names the listing, its price, status and seller so the operator can open it', async () => {
  const t = await setup();
  try {
    await t.as(BUYER); await t.db.query("select public.report_content('listing',$1,'Prohibited or misleading item',null)", [t.listing]);
    const [r] = await reports(t);
    assert.equal(r.target_type, 'listing');
    assert.equal(r.listing.id, t.listing);
    assert.equal(r.listing.title, 'Signed helmet');
    assert.equal(r.listing.price_cents, 12500);
    assert.equal(r.listing.status, 'active');
    assert.equal(r.listing.seller_name, 'Randy Seller');
    assert.equal(r.listing.seller_slug, 'randyseller');
    assert.equal(r.member, null); assert.equal(r.message, null);
  } finally { await t.db.close(); }
});

test('a member report names the member and whether they are banned', async () => {
  const t = await setup();
  try {
    await t.as(BUYER); await t.db.query("select public.report_content('user',$1,'Harassment',null)", [SELLER]);
    await t.raw("update public.profiles set banned_at=now() where id=$1", [SELLER]);
    const [r] = await reports(t);
    assert.equal(r.target_type, 'user');
    assert.equal(r.member.name, 'Randy Seller'); assert.equal(r.member.slug, 'randyseller');
    assert.equal(r.member.banned, true); assert.equal(r.member.deleted, false);
    assert.equal(r.listing, null);
  } finally { await t.db.close(); }
});

test('a message report shows the message, who sent it and the listing the conversation is about', async () => {
  const t = await setup();
  try {
    const conv = (await t.raw('insert into public.conversations(listing_id,buyer_id,seller_id) values($1,$2,$3) returning id', [t.listing, BUYER, SELLER])).rows[0].id;
    const msg = (await t.raw("insert into public.messages(sender_id,body,conversation_id) values($1,'Send the money to my other account',$2) returning id", [BUYER, conv])).rows[0].id;
    await t.as(SELLER); await t.db.query("select public.report_content('message',$1,'Scam or fraud',null)", [msg]);
    const [r] = await reports(t);
    assert.equal(r.target_type, 'message');
    assert.equal(r.message.body, 'Send the money to my other account');
    assert.equal(r.message.sender_name, 'Pat Buyer');
    assert.equal(r.message.listing_id, t.listing); assert.equal(r.message.listing_title, 'Signed helmet');
  } finally { await t.db.close(); }
});

test('a report on a listing that no longer exists still lists, with no details, and non-operators are refused', async () => {
  const t = await setup();
  try {
    await t.as(BUYER); await t.db.query("select public.report_content('listing',$1,'Other',null)", [t.listing]);
    await t.raw("update public.reports set target_id='99999999-9999-4999-8999-999999999999'");
    const [r] = await reports(t);
    assert.equal(r.listing, null);
    await t.as(BUYER);
    await assert.rejects(t.db.query('select public.admin_list_reports() as r'), /Not authorized/);
  } finally { await t.db.close(); }
});
