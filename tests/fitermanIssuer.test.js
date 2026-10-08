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

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

let photoCounter = 0;

// Full buyer/seller handoff to a confirmed checkout, reused by several tests below -- mirrors
// tests/buyAvailability.test.js's own request_to_buy -> respond_to_buy_request lifecycle. This
// suite loads the full migration chain (including 202609300030's background-removed-main-photo
// requirement), so unlike some older isolated test fixtures, a real .png item photo is required.
async function confirmedListing(db, as, raw, seller, buyer, priceCents, pickupStationId) {
  photoCounter++;
  const itemPath = seller + `/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa${String(photoCounter).padStart(4,'0')}.png`;
  await as(seller);
  await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
  const id = (await db.query(
    "select public.create_listing_with_details('Pickup fixture','A fictional listing for testing.','Sports',$1,'',null,null,null,$4,'{}','[]',8,8,6,4,false,'fixed',null,null,null,$2,$3) as id",
    [priceCents, !!pickupStationId, pickupStationId || null, JSON.stringify([{path:itemPath,kind:'item'}])]
  )).rows[0].id;
  await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
  await db.query("select public.save_stripe_account('acct_test_seller')");
  await as(seller,'service_role');
  await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
  await as(buyer);
  const request=(await db.query('select public.request_to_buy($1) as r',[id])).rows[0].r;
  await as(seller);
  await db.query('select public.respond_to_buy_request($1,true)',[request.id]);
  return id;
}


let sessionCounter = 0;
const IDS = { seller: '11111111-1111-4111-8111-111111111111', buyer: '22222222-2222-4222-8222-222222222222', stranger: '33333333-3333-4333-8333-333333333333', operator: '55555555-5555-4555-8555-555555555555' };

async function setup(raw) {
  for (const id of Object.values(IDS)) await raw('insert into auth.users(id,email) values($1,$2)', [id, id.slice(0, 4) + '@example.test']);
  await raw('insert into public.operators(user_id) values($1)', [IDS.operator]);
  return (await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;
}

// One finished checkout (a purchase row) for the given seller/buyer, shipped or pickup.
async function makePurchase(db, as, raw, { seller = IDS.seller, buyer = IDS.buyer, price = 5000, pickup = false, stationId = null } = {}) {
  const listingId = await confirmedListing(db, as, raw, seller, buyer, price, pickup ? stationId : null);
  await as(buyer);
  const reservation = pickup
    ? (await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r", [listingId])).rows[0].r
    : (await db.query('select public.reserve_listing_checkout($1,$2) as r', [listingId, ADDRESS])).rows[0].r;
  sessionCounter += 1;
  await db.query('select public.attach_stripe_checkout_session($1,$2)', [reservation.checkout_session_id, 'cs_test_' + sessionCounter]);
  await as(buyer, 'service_role');
  return (await db.query('select public.finalize_checkout_session($1,$2) as id', ['cs_test_' + sessionCounter, 'pi_test_' + sessionCounter])).rows[0].id;
}

const CHECKS = JSON.stringify({ certificate_matches: true, matches_photos: true, signature_ok: true });
const hoursBetween = async (raw, id) => Number((await raw('select round(extract(epoch from release_after-delivered_at)/3600)::int as h from public.purchases where id=$1', [id])).rows[0].h);
const dueIds = async (raw) => (await raw('select id from public.due_releases()')).rows.map(r => r.id);



const listingOf = async (raw, purchase) => (await raw('select listing_id from public.purchases where id=$1', [purchase])).rows[0].listing_id;

test('Fiterman Sports is an issuer with no certificate number, the removed Credabilia issuer is rejected, and numbered issuers still need a number', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const listing = await listingOf(raw, await makePurchase(db, as, raw, { price: 5000 }));
    await raw("update public.listings set certificate_issuer='fiterman',certificate_number=null,certificate_company=null where id=$1", [listing]);
    assert.equal((await raw('select certificate_issuer from public.listings where id=$1', [listing])).rows[0].certificate_issuer, 'fiterman');
    await assert.rejects(raw("update public.listings set certificate_number='12345' where id=$1", [listing]), /certificate_details_valid/, 'Fiterman has no numbers');
    await assert.rejects(raw("update public.listings set certificate_issuer='credabilia',certificate_number='1' where id=$1", [listing]), /certificate_details_valid/, 'Credabilia has no certificate of its own');
    await assert.rejects(raw("update public.listings set certificate_issuer='psa',certificate_number=null where id=$1", [listing]), /certificate_details_valid/);
    await raw("update public.listings set certificate_issuer='psa',certificate_number='AB12345' where id=$1", [listing]);
    assert.equal((await raw("select public.certificate_rating('fiterman') as r")).rows[0].r, 50);
    assert.equal((await raw("select public.certificate_rating('psa') as r")).rows[0].r, 95);
  } finally { await db.close(); }
});

test('a Fiterman listing gets its own notice and risk flag: no certificate number, no record, and not a statement that the item is fake', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const listing = await listingOf(raw, await makePurchase(db, as, raw, { price: 5000 }));
    await raw("update public.listings set certificate_issuer='fiterman',certificate_number=null,certificate_company=null where id=$1", [listing]);
    await as(IDS.stranger, 'service_role');
    const profile = (await db.query('select public.checkout_risk_profile($1,$2) as p', [listing, IDS.stranger])).rows[0].p;
    assert.equal(profile.certificate_state, 'no_record');
    assert.ok(profile.flags.includes('cert_no_record'));
    assert.ok(!profile.flags.includes('no_certificate') && !profile.flags.includes('cert_unchecked'));
    assert.equal(profile.requires_disclosure, true);
    await as(IDS.stranger);
    const notice = (await db.query('select public.checkout_disclosure($1) as d', [listing])).rows[0].d;
    assert.equal(notice.requires_acknowledgement, true);
    assert.match(notice.text, /Fiterman Sports does not use certificate numbers/);
    assert.match(notice.text, /does not mean the item is not authentic/);
  } finally { await db.close(); }
});

test('anyone can look up a certificate number, case-insensitively; only listed items show, no seller details leak, and a repeat number is flagged', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const first = await listingOf(raw, await makePurchase(db, as, raw, { price: 5000 }));
    await raw("update public.listings set certificate_issuer='psa',certificate_number='AB12345' where id=$1", [first]);

    await as(IDS.stranger, 'anon');
    const hit = (await db.query("select public.lookup_certificate('psa','ab12345') as r")).rows[0].r;
    assert.equal(hit.found, true); assert.equal(hit.count, 1);
    assert.equal(hit.listings[0].id, first);
    assert.deepEqual(Object.keys(hit.listings[0]).sort(), ['category', 'id', 'listed_at', 'status', 'title']);
    assert.equal(hit.listings[0].status, 'Sold');
    assert.equal((await db.query("select public.lookup_certificate('psa','ZZ999') as r")).rows[0].r.found, false);
    assert.equal((await db.query("select public.lookup_certificate('jsa','AB12345') as r")).rows[0].r.found, false, 'the same number at another issuer is a different certificate');

    await assert.rejects(db.query("select public.lookup_certificate('other','AB12345')"), /Choose the certificate issuer/);
    await assert.rejects(db.query("select public.lookup_certificate('fiterman','1')"), /Choose the certificate issuer/);
    await assert.rejects(db.query("select public.lookup_certificate('psa','https://bad.example')"), /certificate number/i);
    await assert.rejects(db.query("select public.lookup_certificate('psa','')"), /certificate number/i);

    // An archived listing is not part of the public record.
    await raw("update public.listings set status='archived' where id=$1", [first]);
    await as(IDS.stranger, 'anon');
    assert.equal((await db.query("select public.lookup_certificate('psa','AB12345') as r")).rows[0].r.found, false);
    await raw("update public.listings set status='sold' where id=$1", [first]);

    // The same number on a second listing: the lookup says so and each listing carries the risk flag.
    const second = await listingOf(raw, await makePurchase(db, as, raw, { price: 6000 }));
    await raw("update public.listings set certificate_issuer='psa',certificate_number='ab12345' where id=$1", [second]);
    await as(IDS.stranger, 'anon');
    const twice = (await db.query("select public.lookup_certificate('psa','AB12345') as r")).rows[0].r;
    assert.equal(twice.count, 2);
    await as(IDS.stranger, 'service_role');
    for (const id of [first, second]) {
      const profile = (await db.query('select public.checkout_risk_profile($1,$2) as p', [id, IDS.stranger])).rows[0].p;
      assert.ok(profile.flags.includes('cert_number_reused'), 'reuse flag on ' + id);
    }
    await raw("update public.listings set certificate_number='CD777' where id=$1", [second]);
    await as(IDS.stranger, 'service_role');
    assert.ok(!(await db.query('select public.checkout_risk_profile($1,$2) as p', [first, IDS.stranger])).rows[0].p.flags.includes('cert_number_reused'));
  } finally { await db.close(); }
});

test('/certificate cannot be claimed as a store name', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    await as(IDS.seller);
    await assert.rejects(db.query("select public.update_store_slug('certificate')"), /reserved/);
    await db.query("select public.update_store_slug('my-store')");
  } finally { await db.close(); }
});
