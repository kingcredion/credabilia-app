import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql'];

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
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
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

test('record_shipment is server-only and cannot fake, replace or re-record a shipment', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const purchase = await makePurchase(db, as, raw);
    await as(IDS.seller);
    await assert.rejects(db.query("select public.record_shipment($1,$2,'tx','FAKE1','https://t','https://l')", [purchase, IDS.seller]), /permission denied/);
    await as(IDS.seller, 'service_role');
    await assert.rejects(db.query("select public.record_shipment($1,$2,'tx','TRACK1','https://t','https://l')", [purchase, IDS.stranger]), /Sale not found/);
    await db.query("select public.record_shipment($1,$2,'tx','TRACK1','https://t/1','https://l/1')", [purchase, IDS.seller]);
    await db.query("select public.record_shipment($1,$2,'tx2','EVIL9','https://t/9','https://l/9')", [purchase, IDS.seller]);
    const row = (await raw('select tracking_number,shipped_at from public.purchases where id=$1', [purchase])).rows[0];
    assert.equal(row.tracking_number, 'TRACK1', 'a second call cannot replace the real tracking number');
    assert.ok(row.shipped_at);
    // a pickup order is never "shipped"
    const stationId = (await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;
    const pickupPurchase = await makePurchase(db, as, raw, { pickup: true, stationId });
    await as(IDS.seller, 'service_role');
    await assert.rejects(db.query("select public.record_shipment($1,$2,'tx','P1','https://t','https://l')", [pickupPurchase, IDS.seller]), /Sale not found/);
  } finally { await db.close(); }
});

test('delivery starts a tiered hold; a new seller waits by price and cannot be released early; disputes and flags block payout', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const purchase = await makePurchase(db, as, raw, { price: 5000 });
    await as(IDS.seller, 'service_role');
    await db.query("select public.record_shipment($1,$2,'tx','TRACK1','https://t/1','https://l/1')", [purchase, IDS.seller]);
    assert.equal((await raw('select release_after from public.purchases where id=$1', [purchase])).rows[0].release_after, null, 'nothing is scheduled before delivery');
    await as(IDS.seller, 'service_role');
    await db.query("select public.update_tracking_status('TRACK1','TRANSIT')");
    assert.equal((await raw('select delivered_at from public.purchases where id=$1', [purchase])).rows[0].delivered_at, null);
    await db.query("select public.update_tracking_status('TRACK1','DELIVERED')");
    const first = (await raw('select delivered_at,hold_tier,hold_hours from public.purchases where id=$1', [purchase])).rows[0];
    assert.equal(first.hold_tier, 'new'); assert.equal(first.hold_hours, 72);
    assert.equal(await hoursBetween(raw, purchase), 72);
    await db.query("select public.update_tracking_status('TRACK1','DELIVERED')");
    assert.equal((await raw('select delivered_at from public.purchases where id=$1', [purchase])).rows[0].delivered_at.getTime(), first.delivered_at.getTime(), 'a repeat DELIVERED does not restart the clock');

    // new-seller hold by price
    const tier = async (price) => (await raw('select public.seller_payout_tier($1,$2) as t', [IDS.seller, price])).rows[0].t;
    assert.equal((await tier(5000)).hold_hours, 72);
    assert.equal((await tier(20000)).hold_hours, 120);
    assert.equal((await tier(50000)).hold_hours, 120);
    assert.equal((await tier(60000)).hold_hours, 168);
    assert.equal((await tier(60000)).early_release, false);

    // not due until the hold passes; an open refund request freezes it
    assert.deepEqual(await dueIds(raw), []);
    await raw("update public.purchases set release_after=now()-interval '1 minute' where id=$1", [purchase]);
    assert.deepEqual(await dueIds(raw), [purchase]);
    await as(IDS.buyer);
    const accepted = (await db.query('select public.accept_delivery($1,$2) as r', [purchase, CHECKS])).rows[0].r;
    assert.equal(accepted.released_early, false, 'a new seller still waits out the hold');
    assert.ok((await raw('select inspection_accepted_at from public.purchases where id=$1', [purchase])).rows[0].inspection_accepted_at, 'the acceptance is recorded');
    await db.query("select public.request_refund($1,'Not as described')", [purchase]);
    assert.deepEqual(await dueIds(raw), [], 'an open refund request blocks payout');
    await raw("update public.refund_requests set status='denied' where purchase_id=$1", [purchase]);
    assert.deepEqual(await dueIds(raw), [purchase], 'a denied request no longer blocks it');

    // a flagged seller is never paid automatically, and clearing the flag restarts the hold
    await raw('update public.profiles set payout_review=true where id=$1', [IDS.seller]);
    assert.deepEqual(await dueIds(raw), []);
    assert.equal((await tier(5000)).tier, 'flagged');
    const second = await makePurchase(db, as, raw, { price: 5000 });
    await as(IDS.seller, 'service_role');
    await db.query("select public.record_shipment($1,$2,'tx','TRACK2','https://t/2','https://l/2')", [second, IDS.seller]);
    await db.query("select public.update_tracking_status('TRACK2','DELIVERED')");
    const flagged = (await raw('select release_after,hold_tier from public.purchases where id=$1', [second])).rows[0];
    assert.equal(flagged.hold_tier, 'flagged'); assert.equal(flagged.release_after, null);
    await as(IDS.stranger);
    await assert.rejects(db.query('select public.admin_set_payout_review($1,false)', [IDS.seller]), /Not authorized/);
    await as(IDS.operator);
    await db.query('select public.admin_set_payout_review($1,false)', [IDS.seller]);
    assert.equal(await hoursBetween(raw, second), 72, 'clearing the flag schedules the payout');
  } finally { await db.close(); }
});

test('established and trusted sellers can be released early; an open dispute still blocks it', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const history = [];
    for (let i = 0; i < 3; i += 1) history.push(await makePurchase(db, as, raw, { price: 3000 }));
    await raw("update public.purchases set escrow_status='released' where id=any($1)", [history]);
    const tier = async (price) => (await raw('select public.seller_payout_tier($1,$2) as t', [IDS.seller, price])).rows[0].t;
    assert.deepEqual([(await tier(3000)).tier, (await tier(3000)).hold_hours, (await tier(3000)).early_release], ['established', 72, true]);

    const purchase = await makePurchase(db, as, raw, { price: 9000 });
    await as(IDS.seller, 'service_role');
    await db.query("select public.record_shipment($1,$2,'tx','TRACKE','https://t','https://l')", [purchase, IDS.seller]);
    await db.query("select public.update_tracking_status('TRACKE','DELIVERED')");
    await as(IDS.buyer);
    const status = (await db.query('select public.my_payout_status() as s')).rows[0].s.find(s => s.purchase_id === purchase);
    assert.equal(status.can_release_early, true);
    await as(IDS.stranger);
    await assert.rejects(db.query('select public.accept_delivery($1,$2)', [purchase, CHECKS]), /Purchase not found/);
    await as(IDS.buyer);
    await db.query("select public.request_refund($1,'Problem')", [purchase]);
    await assert.rejects(db.query('select public.accept_delivery($1,$2)', [purchase, CHECKS]), /open refund request/);
    await raw("update public.refund_requests set status='denied' where purchase_id=$1", [purchase]);
    await assert.rejects(db.query('select public.accept_delivery($1,$2)', [purchase, JSON.stringify({ matches_photos: false })]), /Confirm every item/);
    await assert.rejects(db.query('select public.accept_delivery($1,$2)', [purchase, JSON.stringify({ certificate_matches: true })]), /matches the listing photos/);
    await assert.rejects(db.query('select public.accept_delivery($1,$2)', [purchase, JSON.stringify({ matches_photos: true, bogus: true })]), /Unknown checklist item/);
    const early = (await db.query('select public.accept_delivery($1,$2) as r', [purchase, CHECKS])).rows[0].r;
    assert.equal(early.released_early, true);
    assert.ok((await dueIds(raw)).includes(purchase), 'released early: due at the next sweep');

    // trusted: 10 clean sales and 3 five-star ratings -> 48h under $500, 72h at $500 and up
    const more = [];
    for (let i = 0; i < 7; i += 1) more.push(await makePurchase(db, as, raw, { price: 3000 }));
    await raw("update public.purchases set escrow_status='released' where id=any($1)", [more]);
    for (const id of history) await raw('insert into public.seller_ratings(purchase_id,seller_id,buyer_id,rating) values($1,$2,$3,5)', [id, IDS.seller, IDS.buyer]);
    assert.deepEqual([(await tier(3000)).tier, (await tier(3000)).hold_hours], ['trusted', 48]);
    assert.equal((await tier(50000)).hold_hours, 72);
  } finally { await db.close(); }
});

test('a parcel that never reaches DELIVERED is only paid after 21 days in transit with no dispute', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const purchase = await makePurchase(db, as, raw);
    await as(IDS.seller, 'service_role');
    await db.query("select public.record_shipment($1,$2,'tx','TRACKT','https://t','https://l')", [purchase, IDS.seller]);
    await db.query("select public.update_tracking_status('TRACKT','TRANSIT')");
    await raw("update public.purchases set shipped_at=now()-interval '10 days' where id=$1", [purchase]);
    assert.deepEqual(await dueIds(raw), [], 'the old 10-day payout is gone');
    await raw("update public.purchases set shipped_at=now()-interval '22 days' where id=$1", [purchase]);
    assert.deepEqual(await dueIds(raw), [purchase]);
    await raw("update public.purchases set tracking_status='PRE_TRANSIT' where id=$1", [purchase]);
    assert.deepEqual(await dueIds(raw), [], 'a label that was never scanned is not paid');
    await raw("update public.purchases set tracking_status='TRANSIT' where id=$1", [purchase]);
    await as(IDS.buyer);
    await db.query("select public.request_refund($1,'Never arrived')", [purchase]);
    assert.deepEqual(await dueIds(raw), [], 'a dispute blocks it too');
  } finally { await db.close(); }
});

test('pickup handoff code: only the buyer sees it, the seller enters it, wrong codes are limited, and the payout hold starts from the handoff', async () => {
  const { db, as, raw } = await freshDb();
  try {
    const stationId = await setup(raw);
    const purchase = await makePurchase(db, as, raw, { pickup: true, stationId, price: 3000 });
    const code = (await raw('select pickup_code from public.purchases where id=$1', [purchase])).rows[0].pickup_code;
    assert.match(code, /^\d{6}$/);

    await as(IDS.buyer);
    let buyerView = (await db.query('select public.my_payout_status() as s')).rows[0].s.find(s => s.purchase_id === purchase);
    assert.equal(buyerView.pickup_code, null, 'the code stays hidden until the buyer inspects the item');
    await assert.rejects(db.query('select public.accept_pickup_inspection($1,$2)', [purchase, JSON.stringify({ certificate_matches: true })]), /matches the listing photos/);
    await as(IDS.seller);
    await assert.rejects(db.query('select public.complete_pickup($1,$2)', [purchase, code]), /has not accepted the item yet/);
    await as(IDS.stranger);
    await assert.rejects(db.query('select public.accept_pickup_inspection($1,$2)', [purchase, CHECKS]), /Purchase not found/);
    await as(IDS.buyer);
    await db.query('select public.accept_pickup_inspection($1,$2)', [purchase, CHECKS]);
    buyerView = (await db.query('select public.my_payout_status() as s')).rows[0].s.find(s => s.purchase_id === purchase);
    assert.equal(buyerView.pickup_code, code);
    assert.ok(buyerView.inspection_accepted_at);
    await as(IDS.seller);
    const sellerView = (await db.query('select public.my_payout_status() as s')).rows[0].s.find(s => s.purchase_id === purchase);
    assert.equal(sellerView.pickup_code, null, 'the seller never sees the code');
    assert.equal(sellerView.pickup_attempts_left, 5);
    assert.ok(!JSON.stringify((await db.query('select public.my_sales() as s')).rows[0].s).includes(code), 'my_sales does not leak the code');

    await as(IDS.stranger);
    await assert.rejects(db.query("select public.complete_pickup($1,'000000')", [purchase]), /Sale not found/);
    await as(IDS.buyer);
    await assert.rejects(db.query("select public.complete_pickup($1,'000000')", [purchase]), /Sale not found/);

    await as(IDS.seller);
    const wrong = code === '000001' ? '000002' : '000001';
    let r = (await db.query('select public.complete_pickup($1,$2) as r', [purchase, wrong])).rows[0].r;
    assert.deepEqual([r.ok, r.attempts_left], [false, 4]);
    r = (await db.query('select public.complete_pickup($1,$2) as r', [purchase, wrong])).rows[0].r;
    assert.equal(r.attempts_left, 3);
    r = (await db.query('select public.complete_pickup($1,$2) as r', [purchase, code.slice(0, 3) + ' ' + code.slice(3)])).rows[0].r;
    assert.equal(r.ok, true, 'spaces in the code are ignored');
    assert.equal(r.hold_tier, 'new');
    assert.equal(await hoursBetween(raw, purchase), 72);
    await assert.rejects(db.query('select public.complete_pickup($1,$2)', [purchase, code]), /already complete/);
    await as(IDS.buyer);
    const after = (await db.query('select public.my_payout_status() as s')).rows[0].s.find(s => s.purchase_id === purchase);
    assert.equal(after.pickup_code, null, 'the code is hidden once the handoff is verified');
    assert.ok(after.handoff_verified_at);
  } finally { await db.close(); }
});

test('five wrong pickup codes lock the order, and an established seller is paid at once after a verified handoff', async () => {
  const { db, as, raw } = await freshDb();
  try {
    const stationId = await setup(raw);
    const lockedPurchase = await makePurchase(db, as, raw, { pickup: true, stationId, price: 3000 });
    await as(IDS.buyer);
    await db.query('select public.accept_pickup_inspection($1,$2)', [lockedPurchase, CHECKS]);
    await as(IDS.seller);
    for (let i = 0; i < 5; i += 1) await db.query("select public.complete_pickup($1,'999999')", [lockedPurchase]);
    const code = (await raw('select pickup_code from public.purchases where id=$1', [lockedPurchase])).rows[0].pickup_code;
    await assert.rejects(db.query('select public.complete_pickup($1,$2)', [lockedPurchase, code]), /Too many wrong codes/);

    const history = [];
    for (let i = 0; i < 3; i += 1) history.push(await makePurchase(db, as, raw, { price: 3000 }));
    await raw("update public.purchases set escrow_status='released' where id=any($1)", [history]);
    const purchase = await makePurchase(db, as, raw, { pickup: true, stationId, price: 3000 });
    const goodCode = (await raw('select pickup_code from public.purchases where id=$1', [purchase])).rows[0].pickup_code;
    await as(IDS.buyer);
    await db.query('select public.accept_pickup_inspection($1,$2)', [purchase, CHECKS]);
    await as(IDS.seller);
    await db.query('select public.complete_pickup($1,$2)', [purchase, goodCode]);
    assert.equal(await hoursBetween(raw, purchase), 0);
    assert.ok((await dueIds(raw)).includes(purchase));
    assert.ok(!(await dueIds(raw)).includes(lockedPurchase));
    const evidence = async () => (await db.query('select public.admin_purchase_evidence($1) as e', [purchase])).rows[0].e;
    await as(IDS.operator);
    assert.ok((await evidence()).handoff_verified_at, 'the operator can see the handoff on a dispute');
    await as(IDS.buyer);
    await assert.rejects(evidence(), /Not authorized/);
  } finally { await db.close(); }
});

test('a buyer who finds a problem at the pickup inspection keeps the code hidden and opens a refund request; acceptance is on the operator evidence', async () => {
  const { db, as, raw } = await freshDb();
  try {
    const stationId = await setup(raw);
    const purchase = await makePurchase(db, as, raw, { pickup: true, stationId, price: 3000 });
    await as(IDS.seller);
    await assert.rejects(db.query("select public.reject_pickup_inspection($1,'x')", [purchase]), /Purchase not found/);
    await as(IDS.buyer);
    await assert.rejects(db.query("select public.reject_pickup_inspection($1,'  ')", [purchase]), /Tell us what is wrong/);
    await db.query("select public.reject_pickup_inspection($1,'The certificate number does not match')", [purchase]);
    const row = (await raw('select inspection_issue,inspection_issue_at from public.purchases where id=$1', [purchase])).rows[0];
    assert.equal(row.inspection_issue, 'The certificate number does not match');
    assert.ok(row.inspection_issue_at);
    const refund = (await raw('select reason,status from public.refund_requests where purchase_id=$1', [purchase])).rows[0];
    assert.match(refund.reason, /pickup inspection: The certificate number does not match/);
    const status = (await db.query('select public.my_payout_status() as s')).rows[0].s.find(s => s.purchase_id === purchase);
    assert.equal(status.pickup_code, null);
    await assert.rejects(db.query('select public.accept_pickup_inspection($1,$2)', [purchase, CHECKS]), /open refund request/);
    await as(IDS.seller);
    await assert.rejects(db.query("select public.complete_pickup($1,'123456')", [purchase]), /open refund request/);

    // once accepted, a buyer cannot also "reject"; the operator sees what was confirmed
    const second = await makePurchase(db, as, raw, { pickup: true, stationId, price: 3000 });
    await as(IDS.buyer);
    await db.query('select public.accept_pickup_inspection($1,$2)', [second, CHECKS]);
    await db.query('select public.accept_pickup_inspection($1,$2)', [second, CHECKS]);
    await assert.rejects(db.query("select public.reject_pickup_inspection($1,'changed my mind')", [second]), /already accepted/);
    await as(IDS.operator);
    const evidence = (await db.query('select public.admin_purchase_evidence($1) as e', [second])).rows[0].e;
    assert.ok(evidence.inspection_accepted_at);
    assert.deepEqual(evidence.inspection_checks, { certificate_matches: true, matches_photos: true, signature_ok: true });
  } finally { await db.close(); }
});
