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
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

let n = 0;
const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
async function member(raw, {email, slug, banned = false} = {}) {
  const uid = id();
  await raw('insert into auth.users(id,email) values($1,$2)', [uid, email ?? uid.slice(-5) + '@example.test']);
  if (slug) await raw('update public.profiles set slug=$2 where id=$1', [uid, slug]);
  if (banned) await raw('update public.profiles set banned_at=now() where id=$1', [uid]);
  return uid;
}
async function listing(raw, seller, {status = 'active', title = 'Signed Mike Tyson boxing glove', category = 'Sports', attributes = {}, description = 'A fictional listing for testing only, with enough text to count as a description.', ageDays = 0} = {}) {
  const r = await raw("insert into public.listings(seller_id,title,description,category,price_cents,status,attributes,created_at) values($1,$2,$3,$4,12500,$5,$6,now()-($7||' days')::interval) returning id", [seller, title, description, category, status, JSON.stringify(attributes), String(ageDays)]);
  return r.rows[0].id;
}
const entries = async raw => (await raw('select public.sitemap_entries() as e')).rows[0].e;

test('updated_at moves when a buyer-visible field changes, not for a bid count or version bump', async () => {
  const {raw} = await freshDb();
  const seller = await member(raw);
  const l = await listing(raw, seller, {ageDays: 10});
  await raw("update public.listings set updated_at=now()-interval '10 days' where id=$1", [l]);
  const at = async () => new Date((await raw('select updated_at from public.listings where id=$1', [l])).rows[0].updated_at).getTime();
  const before = await at();
  await raw('update public.listings set bid_count=bid_count+1, version=version+1 where id=$1', [l]);
  assert.equal(await at(), before, 'a bid or version bump is not a content change');
  await raw("update public.listings set description='A different description that is long enough to count.' where id=$1", [l]);
  assert.ok(await at() > before + 5 * 86400000, 'editing the description refreshes it');
  await raw("update public.listings set updated_at=now()-interval '10 days' where id=$1", [l]);
  await raw('update public.listings set price_cents=20000 where id=$1', [l]);
  assert.ok(await at() > before + 5 * 86400000, 'a price change refreshes it');
  await raw("update public.listings set updated_at=now()-interval '10 days' where id=$1", [l]);
  await raw("update public.listings set status='sold' where id=$1", [l]);
  assert.ok(await at() > before + 5 * 86400000, 'a status change refreshes it');
});

test('the sitemap feed lists only public listings: drafts, archived, sold and banned sellers are out; new and removed listings follow automatically', async () => {
  const {raw} = await freshDb();
  const seller = await member(raw, {slug: 'northfield'});
  const banned = await member(raw, {slug: 'badseller', banned: true});
  const live = await listing(raw, seller);
  const draft = await listing(raw, seller, {status: 'draft'});
  const archived = await listing(raw, seller, {status: 'archived'});
  const sold = await listing(raw, seller, {status: 'sold'});
  const fromBanned = await listing(raw, banned);
  let e = await entries(raw);
  assert.deepEqual(e.listings.map(x => x.id), [live]);
  for (const hidden of [draft, archived, sold, fromBanned]) assert.ok(!e.listings.some(x => x.id === hidden));
  assert.ok(e.listings[0].updated_at && e.listings[0].created_at, 'both dates are carried');
  assert.deepEqual(e.storefronts, ['northfield']);
  assert.equal(e.storefront_entries[0].slug, 'northfield');
  assert.ok(e.storefront_entries[0].lastmod, 'a storefront date comes from its listings');
  const second = await listing(raw, seller, {title: 'Signed Jose Canseco baseball card'});
  e = await entries(raw);
  assert.equal(e.listings.length, 2);
  await raw("update public.listings set status='archived' where id=$1", [second]);
  e = await entries(raw);
  assert.deepEqual(e.listings.map(x => x.id), [live]);
});

test('categories in the feed carry real counts and dates, and a category with nothing public is absent', async () => {
  const {raw} = await freshDb();
  const seller = await member(raw);
  await listing(raw, seller, {category: 'Sports'}); await listing(raw, seller, {category: 'Sports'}); await listing(raw, seller, {category: 'Entertainment'});
  await listing(raw, seller, {category: 'Comics', status: 'draft'});
  const e = await entries(raw);
  assert.deepEqual(e.categories.map(c => [c.category, c.count]), [['Entertainment', 1], ['Sports', 2]]);
  assert.ok(e.categories.every(c => c.lastmod));
});

test('the listing preview carries the seller, details and certificate issuer, and is empty for anything not public', async () => {
  const {raw} = await freshDb();
  const seller = await member(raw, {slug: 'northfield'});
  const l = await listing(raw, seller, {attributes: {subject: 'Mike Tyson', sport: 'Boxing', year: '1988'}});
  await raw("update public.listings set certificate_issuer='psa', certificate_number='AB123456' where id=$1", [l]);
  const p = (await raw('select public.get_listing_preview($1) as p', [l])).rows[0].p;
  assert.equal(p.seller_slug, 'northfield');
  assert.deepEqual(p.attributes, {subject: 'Mike Tyson', sport: 'Boxing', year: '1988'});
  assert.equal(p.certificate_issuer, 'psa');
  assert.equal(p.certificate_has_number, true);
  assert.equal(p.giveaway_prize, false);
  assert.ok(p.updated_at);
  const plain = await listing(raw, seller, {title: 'No certificate here'});
  assert.equal((await raw('select public.get_listing_preview($1) as p', [plain])).rows[0].p.certificate_issuer, null, 'no issuer on the listing means none is claimed');
  for (const status of ['draft', 'archived', 'sold']) {
    const hidden = await listing(raw, seller, {status});
    assert.equal((await raw('select public.get_listing_preview($1) as p', [hidden])).rows[0].p, null, status);
  }
});

test('the giveaway prize keeps its page but is flagged, left out of lists and category counts', async () => {
  const {raw, db, as} = await freshDb();
  await raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
  const king = await member(raw, {email: 'king@example.test'});
  await raw('insert into public.operators(user_id) values($1)', [king]);
  await raw("insert into public.stripe_accounts(user_id,stripe_account_id,charges_enabled) values($1,'acct_king',true)", [king]);
  const prize = await listing(raw, king, {title: 'Michael Vick football jersey'});
  const other = await listing(raw, king, {title: 'Signed helmet'});
  await as(king);
  await db.query('select public.admin_start_giveaway($1)', [prize]);
  await raw('reset role');
  const p = (await raw('select public.get_listing_preview($1) as p', [prize])).rows[0].p;
  assert.equal(p.giveaway_prize, true);
  const e = await entries(raw);
  assert.ok(e.listings.some(x => x.id === prize), 'its own page is still a public page');
  assert.deepEqual(e.categories.map(c => [c.category, c.count]), [['Sports', 1]], 'but it is not counted as an item in the category');
  const index = (await raw('select public.seo_listing_index() as i')).rows[0].i;
  assert.deepEqual(index.map(x => x.id), [other], 'and it is not offered in crawler lists');
});

test('the crawler list is newest first, can be filtered by category, limited, and can leave one listing out', async () => {
  const {raw} = await freshDb();
  const seller = await member(raw, {slug: 'northfield'});
  const old = await listing(raw, seller, {title: 'Older item one', ageDays: 5});
  const mid = await listing(raw, seller, {title: 'Middle item two', ageDays: 3, category: 'Entertainment'});
  const fresh = await listing(raw, seller, {title: 'Fresh item three', ageDays: 1});
  const get = async (...args) => (await raw('select public.seo_listing_index($1,$2,$3) as i', args)).rows[0].i.map(x => x.id);
  assert.deepEqual(await get(null, 60, null), [fresh, mid, old]);
  assert.deepEqual(await get('Sports', 60, null), [fresh, old]);
  assert.deepEqual(await get(null, 1, null), [fresh]);
  assert.deepEqual(await get(null, 60, fresh), [mid, old]);
  const sample = (await raw('select public.seo_listing_index() as i')).rows[0].i[0];
  assert.deepEqual(Object.keys(sample).sort(), ['category', 'created_at', 'id', 'price_cents', 'seller_slug', 'title', 'updated_at']);
});

test('the SEO health report is for operators only and counts what is eligible and what is missing', async () => {
  const {raw, db, as} = await freshDb();
  const king = await member(raw, {email: 'king@example.test'});
  await raw('insert into public.operators(user_id) values($1)', [king]);
  const seller = await member(raw, {slug: 'northfield'});
  await listing(raw, seller, {title: 'Signed Mike Tyson boxing glove'});
  await listing(raw, seller, {title: 'Dup title here please', description: 'Twenty-five chars long.'});
  await listing(raw, seller, {title: 'Dup title here please'});
  await as(seller);
  await assert.rejects(db.query('select public.seo_health()'), /Operators only|permission denied/);
  await as(king);
  const h = (await db.query('select public.seo_health() as h')).rows[0].h;
  assert.equal(h.indexable_listings, 3);
  assert.equal(h.missing_photo, 3, 'none of these test listings has a photo');
  assert.equal(h.thin_description, 1);
  assert.equal(h.duplicate_titles, 1);
  assert.equal(h.categories_with_inventory, 1);
  assert.equal(h.storefronts_with_slug, 1);
  assert.equal(h.giveaway_prizes_in_sitemap, 0);
});

test('"category" cannot be claimed as a store name', async () => {
  const {db, raw, as} = await freshDb();
  const seller = await member(raw);
  await as(seller);
  await assert.rejects(db.query("select public.update_store_slug('category')"), /reserved/);
  await db.query("select public.update_store_slug('my-store')");
});
