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


const sessionOf = async (raw, purchase) => (await raw('select c.id from public.checkout_sessions c join public.purchases p on p.stripe_checkout_session_id=c.stripe_checkout_session_id where p.id=$1', [purchase])).rows[0].id;
const listingOf = async (raw, purchase) => (await raw('select listing_id from public.purchases where id=$1', [purchase])).rows[0].listing_id;

test('the risk profile reads certificate state, value and buyer history; the notice wording comes from the server', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const first = await makePurchase(db, as, raw, { price: 5000 });
    const listing = await listingOf(raw, first);
    // A fresh high-priced listing (no certificate) as seen by someone who has never bought anything.
    const fresh = await confirmedListing(db, as, raw, IDS.seller, IDS.stranger, 60000, null);
    await as(IDS.stranger, 'service_role');
    const p1 = (await db.query('select public.checkout_risk_profile($1,$2) as p', [fresh, IDS.stranger])).rows[0].p;
    assert.equal(p1.certificate_state, 'none');
    assert.equal(p1.requires_disclosure, true);
    for (const flag of ['high_value', 'no_certificate', 'new_buyer_high_value']) assert.ok(p1.flags.includes(flag), flag);
    assert.equal(p1.level, 'high');
    assert.equal(p1.signature_required, true);
    assert.equal(p1.require_3ds, true);

    // The same item once it carries seller-entered certificate details is "seller_reported", not "none".
    await raw("update public.listings set certificate_issuer='psa',certificate_number='AB12345' where id=$1", [fresh]);
    await as(IDS.stranger, 'service_role');
    const p2 = (await db.query('select public.checkout_risk_profile($1,$2) as p', [fresh, IDS.stranger])).rows[0].p;
    assert.equal(p2.certificate_state, 'seller_reported');
    assert.ok(p2.flags.includes('cert_unchecked') && !p2.flags.includes('no_certificate'));

    // The buyer-facing wording is read through a signed-in function and matches what the table stores.
    await as(IDS.buyer);
    const d = (await db.query('select public.checkout_disclosure($1) as d', [listing])).rows[0].d;
    assert.equal(d.requires_acknowledgement, true);
    assert.equal(d.certificate_state, 'none');
    assert.match(d.text, /no certificate of authenticity/);
    assert.match(d.text, /does not authenticate items/);
    const stored = (await raw("select body from public.disclosure_versions where version=$1 and certificate_state='none'", [d.version])).rows[0].body;
    assert.equal(d.text, stored);

    // Clients cannot call the server-only functions.
    await as(IDS.buyer);
    await assert.rejects(db.query('select public.checkout_risk_profile($1,$2)', [listing, IDS.buyer]), /permission denied/);
    await assert.rejects(db.query('select public.record_checkout_risk($1,$2,true)', [IDS.buyer, '{}']), /permission denied/);
  } finally { await db.close(); }
});

test('a recorded checkout keeps the notice wording and whether it was confirmed, and feeds the chargeback evidence', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const purchase = await makePurchase(db, as, raw, { price: 60000 });
    const sid = await sessionOf(raw, purchase), listing = await listingOf(raw, purchase);
    await as(IDS.buyer, 'service_role');
    const profile = (await db.query('select public.checkout_risk_profile($1,$2) as p', [listing, IDS.buyer])).rows[0].p;
    await db.query('select public.record_checkout_risk($1,$2,true)', [sid, JSON.stringify(profile)]);
    const row = (await raw('select * from public.checkout_risk where checkout_session_id=$1', [sid])).rows[0];
    assert.equal(row.certificate_state, 'none');
    assert.ok(row.disclosure_acknowledged_at, 'the confirmation time is saved');
    assert.equal(row.signature_required, true);
    assert.ok(row.flags.includes('high_value'));
    // Recording again (a retried request) updates the same row rather than adding a second one.
    await as(IDS.buyer, 'service_role');
    await db.query('select public.record_checkout_risk($1,$2,false)', [sid, JSON.stringify(profile)]);
    assert.equal((await raw('select count(*)::int as n from public.checkout_risk where checkout_session_id=$1', [sid])).rows[0].n, 1);
    assert.equal((await raw('select disclosure_acknowledged_at from public.checkout_risk where checkout_session_id=$1', [sid])).rows[0].disclosure_acknowledged_at, null, 'an unconfirmed notice is recorded as unconfirmed');
    await as(IDS.buyer, 'service_role');
    await db.query('select public.record_checkout_risk($1,$2,true)', [sid, JSON.stringify(profile)]);

    await as(IDS.buyer, 'service_role');
    const tags = (await db.query('select public.checkout_stripe_tags($1) as t', [sid])).rows[0].t;
    assert.equal(tags.risk_level, row.level);
    assert.equal(tags.disclosure_acknowledged, 'true');
    assert.equal(tags.listing_id, listing);
    for (const value of Object.values(tags)) assert.ok(String(value).length <= 500);
    assert.ok(!JSON.stringify(tags).includes('@'), 'no email addresses go to Stripe as tags');

    await as(IDS.buyer, 'service_role');
    const packet = (await db.query('select public.dispute_evidence_packet($1) as p', [purchase])).rows[0].p;
    assert.match(packet.disclosure_text, /no certificate of authenticity/);
    assert.ok(packet.disclosure_acknowledged_at);
    assert.equal(packet.price_cents, 60000);
    assert.equal(packet.signature_required, true);
    assert.ok(packet.buyer_email);
  } finally { await db.close(); }
});

test('a card chargeback holds the order, freezes the seller when they were already paid, and never releases money by itself', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const open = await makePurchase(db, as, raw, { price: 5000 });
    await as(IDS.seller, 'service_role');
    await db.query("select public.record_shipment($1,$2,'tx','T-OPEN','https://t','https://l')", [open, IDS.seller]);
    await db.query("select public.update_tracking_status('T-OPEN','DELIVERED')");
    await raw("update public.purchases set release_after=now()-interval '1 hour' where id=$1", [open]);
    assert.ok((await dueIds(raw)).includes(open), 'ready to pay out before the dispute');

    const intent = (await raw('select stripe_payment_intent_id from public.purchases where id=$1', [open])).rows[0].stripe_payment_intent_id;
    const dispute = { id: 'dp_1', payment_intent: intent, amount: 5000, reason: 'product_not_received', status: 'needs_response', evidence_due_by: '1900000000' };
    await as(IDS.buyer, 'service_role');
    const result = (await db.query('select public.record_stripe_dispute($1) as r', [JSON.stringify(dispute)])).rows[0].r;
    assert.equal(result.purchase_id, open);
    assert.equal(result.seller_already_paid, false);
    assert.equal((await raw('select review_hold from public.purchases where id=$1', [open])).rows[0].review_hold, true);
    assert.ok(!(await dueIds(raw)).includes(open), 'a disputed order is not paid out');
    assert.equal((await raw('select payout_review from public.profiles where id=$1', [IDS.seller])).rows[0].payout_review, false, 'the seller is not frozen when they have not been paid yet');

    // Replaying the same event does not duplicate the row.
    await as(IDS.buyer, 'service_role');
    await db.query('select public.record_stripe_dispute($1)', [JSON.stringify(dispute)]);
    assert.equal((await raw('select count(*)::int as n from public.payment_disputes')).rows[0].n, 1);

    // Winning the dispute updates the record but leaves the hold for a person to clear.
    await as(IDS.buyer, 'service_role');
    await db.query('select public.record_stripe_dispute($1)', [JSON.stringify({ ...dispute, status: 'won' })]);
    assert.equal((await raw('select status from public.payment_disputes where stripe_dispute_id=$1', ['dp_1'])).rows[0].status, 'won');
    assert.equal((await raw('select review_hold from public.purchases where id=$1', [open])).rows[0].review_hold, true);

    // An order the seller was already paid for: the dispute freezes all of the seller's payouts.
    const paid = await makePurchase(db, as, raw, { price: 5000 });
    await raw("update public.purchases set escrow_status='released',stripe_transfer_id='tr_1' where id=$1", [paid]);
    const paidIntent = (await raw('select stripe_payment_intent_id from public.purchases where id=$1', [paid])).rows[0].stripe_payment_intent_id;
    await as(IDS.buyer, 'service_role');
    const paidResult = (await db.query('select public.record_stripe_dispute($1) as r', [JSON.stringify({ id: 'dp_2', payment_intent: paidIntent, amount: 5000, reason: 'fraudulent', status: 'needs_response' })])).rows[0].r;
    assert.equal(paidResult.seller_already_paid, true);
    assert.equal(paidResult.transfer_id, 'tr_1');
    assert.equal((await raw('select payout_review from public.profiles where id=$1', [IDS.seller])).rows[0].payout_review, true);
    await as(IDS.buyer, 'service_role');
    await db.query("select public.mark_dispute_progress('dp_2',true,true)");
    const marked = (await raw("select evidence_saved_at,transfer_reversed from public.payment_disputes where stripe_dispute_id='dp_2'")).rows[0];
    assert.ok(marked.evidence_saved_at); assert.equal(marked.transfer_reversed, true);

    // A dispute for a payment we do not recognise is still recorded (so nothing is lost) but holds nothing.
    await as(IDS.buyer, 'service_role');
    const unknown = (await db.query('select public.record_stripe_dispute($1) as r', [JSON.stringify({ id: 'dp_3', payment_intent: 'pi_unknown', amount: 100, reason: 'general', status: 'needs_response' })])).rows[0].r;
    assert.equal(unknown.purchase_id, null);
    // The functions are not reachable by ordinary users.
    await as(IDS.buyer);
    await assert.rejects(db.query('select public.record_stripe_dispute($1)', [JSON.stringify(dispute)]), /permission denied/);
  } finally { await db.close(); }
});

test('operators see flagged orders and can add private notes; nobody else can read or write them', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const purchase = await makePurchase(db, as, raw, { price: 60000 });
    const sid = await sessionOf(raw, purchase), listing = await listingOf(raw, purchase);
    await as(IDS.buyer, 'service_role');
    const profile = (await db.query('select public.checkout_risk_profile($1,$2) as p', [listing, IDS.buyer])).rows[0].p;
    await db.query('select public.record_checkout_risk($1,$2,true)', [sid, JSON.stringify(profile)]);

    await as(IDS.stranger);
    await assert.rejects(db.query('select public.admin_order_risk_queue()'), /Not authorized/);
    await assert.rejects(db.query("select public.admin_add_order_note($1,'x')", [purchase]), /Not authorized/);
    await as(IDS.seller);
    await assert.rejects(db.query('select * from public.order_notes'), /permission denied/);

    await as(IDS.operator);
    await db.query("select public.admin_add_order_note($1,'  Seller says the cert is genuine; asked for the issuer lookup.  ')", [purchase]);
    await assert.rejects(db.query("select public.admin_add_order_note($1,'   ')", [purchase]));
    const queue = (await db.query('select public.admin_order_risk_queue() as q')).rows[0].q;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].purchase_id, purchase);
    assert.equal(queue[0].level, 'high');
    assert.equal(queue[0].notes.length, 1);
    assert.equal(queue[0].notes[0].note, 'Seller says the cert is genuine; asked for the issuer lookup.');
    assert.equal(queue[0].disclosure_acknowledged, true);
    // A routine low-risk order that nobody flagged is not in the queue.
    await makePurchase(db, as, raw, { price: 5000 });
    await as(IDS.operator);
    assert.equal((await db.query('select public.admin_order_risk_queue() as q')).rows[0].q.length, 1);
  } finally { await db.close(); }
});

test('only the seller can state that their listing is authentic, and only the first statement counts', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const purchase = await makePurchase(db, as, raw, { price: 5000 });
    const listing = await listingOf(raw, purchase);
    await as(IDS.stranger);
    await db.query('select public.attest_listing_authenticity($1)', [listing]);
    assert.equal((await raw('select authenticity_attested_at from public.listings where id=$1', [listing])).rows[0].authenticity_attested_at, null, 'someone else cannot attest for the seller');
    await as(IDS.seller);
    await db.query('select public.attest_listing_authenticity($1)', [listing]);
    const first = (await raw('select authenticity_attested_at,authenticity_attestation_version from public.listings where id=$1', [listing])).rows[0];
    assert.ok(first.authenticity_attested_at); assert.match(first.authenticity_attestation_version, /^seller-/);
    await as(IDS.seller);
    await db.query('select public.attest_listing_authenticity($1)', [listing]);
    assert.equal((await raw('select authenticity_attested_at from public.listings where id=$1', [listing])).rows[0].authenticity_attested_at.getTime(), first.authenticity_attested_at.getTime());
    await as(IDS.buyer, 'anon');
    await assert.rejects(db.query('select public.attest_listing_authenticity($1)', [listing]), /permission denied/);
  } finally { await db.close(); }
});
