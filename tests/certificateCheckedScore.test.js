import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {credibilityScore} from '../src/credibility.js';
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

// A live, signed listing as the marketplace shows it, with the given certificate columns.
async function liveSignedListing(db, as, raw, cert) {
  const listing = await listingOf(raw, await makePurchase(db, as, raw, { price: 5000 }));
  await raw("update public.listings set status='active',certificate_issuer=$2,certificate_number=$3,certificate_company=null where id=$1", [listing, cert.issuer, cert.number]);
  await raw("update public.listings set attributes=jsonb_build_object('subject','Test Signer') where id=$1", [listing]);
  await raw("insert into public.listing_media(path,listing_id,kind,position) values ($1,$2,'signature',5)", [IDS.seller + '/sig-' + listing + '.jpg', listing]);
  return listing;
}
const browse = async (db, as, id) => {
  await as(IDS.stranger, 'anon');
  const rows = (await db.query('select s from jsonb_array_elements(public.browse_scored_listings(100)) s')).rows.map(r => r.s);
  return rows.find(row => row.id === id);
};

test('an unchecked certificate number counts at 75% of the issuer rating, a checked one in full, Fiterman at its flat rating, none at 25 -- and the page preview agrees', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const unchecked = await liveSignedListing(db, as, raw, { issuer: 'psa', number: 'AB12345' });
    const checked = await liveSignedListing(db, as, raw, { issuer: 'bas', number: 'CD67890' });
    const fiterman = await liveSignedListing(db, as, raw, { issuer: 'fiterman', number: null });
    const none = await liveSignedListing(db, as, raw, { issuer: null, number: null });
    await as(IDS.operator);
    await db.query('select public.admin_set_certificate_checked($1,true)', [checked]);

    const expectations = [
      [unchecked, 71, { certificate_issuer: 'psa', certificate_number: 'AB12345' }],
      [checked, 93, { certificate_issuer: 'bas', certificate_number: 'CD67890', certificate_checked_at: '2026-10-08T00:00:00Z' }],
      [fiterman, 50, { certificate_issuer: 'fiterman', certificate_number: null }],
      [none, 25, {}],
    ];
    for (const [id, expectedCertificateScore, fixture] of expectations) {
      const row = await browse(db, as, id);
      assert.equal(row.certificate_score, expectedCertificateScore, 'certificate score for ' + (fixture.certificate_issuer || 'no certificate'));
      const preview = credibilityScore(fixture);
      assert.equal(row.credibility_score, preview.credibility_score, 'the score on the page matches the preview for ' + (fixture.certificate_issuer || 'no certificate'));
      assert.equal(row.certificate_score, preview.certificate_score);
    }
    assert.ok((await browse(db, as, checked)).certificate_checked_at, 'the item reports that it was checked');
    assert.equal((await browse(db, as, unchecked)).certificate_checked_at, null);
  } finally { await db.close(); }
});

test('only an operator can mark a certificate checked, it needs a number, and changing the number clears the check', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const listing = await liveSignedListing(db, as, raw, { issuer: 'psa', number: 'AB12345' });
    const bare = await liveSignedListing(db, as, raw, { issuer: 'fiterman', number: null });
    await as(IDS.seller);
    await assert.rejects(db.query('select public.admin_set_certificate_checked($1,true)', [listing]), /Not authorized/);
    await assert.rejects(db.query('select public.admin_list_certificates_to_check()'), /Not authorized/);
    await as(IDS.operator);
    await assert.rejects(db.query('select public.admin_set_certificate_checked($1,true)', [bare]), /no certificate number/);
    await db.query('select public.admin_set_certificate_checked($1,true)', [listing]);
    const row = (await raw('select certificate_checked_at,certificate_checked_by from public.listings where id=$1', [listing])).rows[0];
    assert.ok(row.certificate_checked_at); assert.equal(row.certificate_checked_by, IDS.operator);

    // Editing something else keeps the check; changing the number wipes it.
    await raw("update public.listings set title='A new title for the item' where id=$1", [listing]);
    assert.ok((await raw('select certificate_checked_at from public.listings where id=$1', [listing])).rows[0].certificate_checked_at);
    await raw("update public.listings set certificate_number='ZZ99999' where id=$1", [listing]);
    const wiped = (await raw('select certificate_checked_at,certificate_checked_by from public.listings where id=$1', [listing])).rows[0];
    assert.equal(wiped.certificate_checked_at, null); assert.equal(wiped.certificate_checked_by, null);

    await as(IDS.operator);
    await db.query('select public.admin_set_certificate_checked($1,true)', [listing]);
    await db.query('select public.admin_set_certificate_checked($1,false)', [listing]);
    assert.equal((await raw('select certificate_checked_at from public.listings where id=$1', [listing])).rows[0].certificate_checked_at, null, 'an operator can undo a check');
  } finally { await db.close(); }
});

test('a checked certificate needs no notice at checkout; the operator list shows numbered certificates and repeats', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const listing = await liveSignedListing(db, as, raw, { issuer: 'psa', number: 'AB12345' });
    const twin = await liveSignedListing(db, as, raw, { issuer: 'psa', number: 'ab12345' });
    await as(IDS.stranger, 'service_role');
    const before = (await db.query('select public.checkout_risk_profile($1,$2) as p', [listing, IDS.stranger])).rows[0].p;
    assert.equal(before.certificate_state, 'seller_reported'); assert.equal(before.requires_disclosure, true);
    await as(IDS.operator);
    await db.query('select public.admin_set_certificate_checked($1,true)', [listing]);
    await as(IDS.stranger, 'service_role');
    const after = (await db.query('select public.checkout_risk_profile($1,$2) as p', [listing, IDS.stranger])).rows[0].p;
    assert.equal(after.certificate_state, 'issuer_checked'); assert.equal(after.requires_disclosure, false);
    assert.ok(!after.flags.includes('cert_unchecked'));

    await as(IDS.operator);
    const rows = (await db.query('select public.admin_list_certificates_to_check() as r')).rows[0].r;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].listing_id, twin, 'unchecked certificates come first');
    assert.equal(rows[0].also_on, 1);
    assert.ok(rows[1].checked_at);
  } finally { await db.close(); }
});
