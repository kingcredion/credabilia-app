import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

async function freshDb() {
  const db = new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
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
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

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

test('pickup_stations: publicly readable, not writable by any client role', async () => {
  const { db, as, raw } = await freshDb();
  try {
    const count=(await raw('select count(*)::int as n from public.pickup_stations')).rows[0].n;
    assert.ok(count>400,'expects the real seeded dataset, not a handful of rows');
    await db.exec('reset role'); await db.exec('set role anon');
    const anonRows=(await db.query('select count(*)::int as n from public.pickup_stations')).rows[0].n;
    assert.equal(anonRows,count);
    await db.exec('set role authenticated');
    await assert.rejects(db.query("insert into public.pickup_stations(jurisdiction,city,state,country) values('Fake PD','Nowhere','ZZ','USA')"), /permission denied/);
    await assert.rejects(db.query("update public.pickup_stations set notes='hacked'"), /permission denied/);
    await assert.rejects(db.query('delete from public.pickup_stations'), /permission denied/);
  } finally { await db.close(); }
});

test('create_listing_with_details rejects pickup_enabled with a missing or invalid station', async () => {
  const { db, as } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await db.query('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    await assert.rejects(
      db.query("select public.create_listing_with_details('Bad pickup','A fictional listing for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'fixed',null,null,null,true,null) as id"),
      /valid pickup location/
    );
    const fakeId='00000000-0000-4000-8000-000000000000';
    await assert.rejects(
      db.query("select public.create_listing_with_details('Bad pickup','A fictional listing for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'fixed',null,null,null,true,$1) as id",[fakeId]),
      /valid pickup location/
    );
  } finally { await db.close(); }
});

test('reserve_listing_checkout: pickup succeeds with no address on a pickup-enabled listing, and is refused on one without pickup', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, buyer]);
    const stationId=(await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;

    const pickupListingId = await confirmedListing(db, as, raw, seller, buyer, 3000, stationId);
    await as(buyer);
    const reservation=(await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r",[pickupListingId])).rows[0].r;
    assert.equal(reservation.fulfillment_method,'pickup');
    assert.equal(reservation.want_insurance,false);
    assert.equal(reservation.pickup_station.jurisdiction,'Cedar Park Police Department');
    const session=(await raw('select shipping_address,fulfillment_method,pickup_station_id,want_insurance from public.checkout_sessions where id=$1',[reservation.checkout_session_id])).rows[0];
    assert.equal(session.shipping_address,null);
    assert.equal(session.fulfillment_method,'pickup');
    assert.equal(session.pickup_station_id,stationId);
    assert.equal(session.want_insurance,false);

    // A listing that never enabled pickup refuses a pickup checkout attempt.
    const shipOnlyListingId = await confirmedListing(db, as, raw, seller, buyer, 3000, null);
    await as(buyer);
    await assert.rejects(db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup')",[shipOnlyListingId]), /not available for pickup/);

    // The existing shipping path still enforces a full address -- unchanged regression guard.
    await assert.rejects(db.query("select public.reserve_listing_checkout($1,$2)",[shipOnlyListingId,{}]), /Fill in all required address fields/);
    const shipReservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[shipOnlyListingId,ADDRESS])).rows[0].r;
    assert.equal(shipReservation.fulfillment_method,'ship');
    assert.equal(shipReservation.pickup_station,null);
  } finally { await db.close(); }
});

test('finalize_checkout_session snapshots fulfillment_method/pickup_station_id onto the purchase', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, buyer]);
    const stationId=(await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;
    const listingId = await confirmedListing(db, as, raw, seller, buyer, 3000, stationId);
    await as(buyer);
    const reservation=(await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r",[listingId])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_pickup')",[reservation.checkout_session_id]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_pickup','pi_test_pickup') as id")).rows[0].id;
    const purchase=(await raw('select fulfillment_method,pickup_station_id,escrow_status from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(purchase.fulfillment_method,'pickup');
    assert.equal(purchase.pickup_station_id,stationId);
    assert.equal(purchase.escrow_status,'held');
  } finally { await db.close(); }
});

test('my_notifications(): seller gets a non-blocking reminder to mark pickup, buyer gets a confirm reminder once marked', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, buyer]);
    const stationId=(await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;
    const listingId = await confirmedListing(db, as, raw, seller, buyer, 3000, stationId);
    await as(buyer);
    const reservation=(await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r",[listingId])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_notify')",[reservation.checkout_session_id]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_notify','pi_test_notify') as id")).rows[0].id;

    // Before the seller marks it: seller sees the "mark it once you've handed it off" nudge,
    // buyer sees nothing yet (nothing has happened for them to confirm).
    await as(seller);
    let notes=(await db.query('select public.my_notifications() as n')).rows[0].n;
    assert.ok(notes.some(n=>n.kind==='pickup_awaiting_handoff' && n.purchase_id===purchaseId));
    await as(buyer);
    notes=(await db.query('select public.my_notifications() as n')).rows[0].n;
    assert.ok(!notes.some(n=>n.kind==='pickup_awaiting_confirmation'));

    // After the seller marks it: seller's own nudge clears, buyer's confirm reminder appears.
    await as(seller);
    await db.query('select public.mark_picked_up($1)',[purchaseId]);
    notes=(await db.query('select public.my_notifications() as n')).rows[0].n;
    assert.ok(!notes.some(n=>n.kind==='pickup_awaiting_handoff' && n.purchase_id===purchaseId));
    await as(buyer);
    notes=(await db.query('select public.my_notifications() as n')).rows[0].n;
    assert.ok(notes.some(n=>n.kind==='pickup_awaiting_confirmation' && n.purchase_id===purchaseId));

    // After the buyer confirms: the reminder clears for them too.
    await db.query('select public.confirm_pickup_received($1)',[purchaseId]);
    notes=(await db.query('select public.my_notifications() as n')).rows[0].n;
    assert.ok(!notes.some(n=>n.kind==='pickup_awaiting_confirmation'));
  } finally { await db.close(); }
});

test('mark_picked_up / confirm_pickup_received: ownership, ordering, and write-once', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222', stranger = '33333333-3333-4333-8333-333333333333';
  try {
    await raw('insert into auth.users(id) values($1),($2),($3)', [seller, buyer, stranger]);
    const stationId=(await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;
    const listingId = await confirmedListing(db, as, raw, seller, buyer, 3000, stationId);
    await as(buyer);
    const reservation=(await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r",[listingId])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_handoff')",[reservation.checkout_session_id]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_handoff','pi_test_handoff') as id")).rows[0].id;

    // Buyer can't confirm before the seller has marked it picked up.
    await as(buyer);
    await assert.rejects(db.query('select public.confirm_pickup_received($1)',[purchaseId]), /confirm the handoff first/);

    // Only the seller can mark it, and only their own sale.
    await as(stranger);
    await assert.rejects(db.query('select public.mark_picked_up($1)',[purchaseId]), /Sale not found/);
    await as(buyer);
    await assert.rejects(db.query('select public.mark_picked_up($1)',[purchaseId]), /Sale not found/);
    await as(seller);
    await db.query('select public.mark_picked_up($1)',[purchaseId]);
    await assert.rejects(db.query('select public.mark_picked_up($1)',[purchaseId]), /already marked picked up/);

    // Only the buyer can confirm, and only their own purchase.
    await as(stranger);
    await assert.rejects(db.query('select public.confirm_pickup_received($1)',[purchaseId]), /confirm the handoff first/);
    await as(seller);
    await assert.rejects(db.query('select public.confirm_pickup_received($1)',[purchaseId]), /confirm the handoff first/);
    await as(buyer);
    const confirmed=(await db.query('select public.confirm_pickup_received($1) as r',[purchaseId])).rows[0].r;
    assert.ok(confirmed.buyer_confirmed_pickup_at);
    // Neither RPC ever flips escrow_status itself -- that's mark_purchase_released's job alone,
    // called from confirm-pickup/handler.js after a real Stripe transfer succeeds.
    assert.equal(confirmed.escrow_status,'held');
    await assert.rejects(db.query('select public.confirm_pickup_received($1)',[purchaseId]), /already confirmed/);

    // Confirms the write-once guard also blocks a fresh confirm attempt once escrow is released --
    // simulating what the edge function does next.
    await raw("select public.mark_purchase_released($1,'tr_test_pickup')",[purchaseId]);
    const released=(await raw('select escrow_status from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(released.escrow_status,'released');
  } finally { await db.close(); }
});

test('mark_picked_up and confirm_pickup_received are only callable as authenticated, never directly release escrow', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, buyer]);
    await db.exec('reset role'); await db.exec('set role anon');
    const fakeId='00000000-0000-4000-8000-000000000000';
    await assert.rejects(db.query('select public.mark_picked_up($1)',[fakeId]), /permission denied/);
    await assert.rejects(db.query('select public.confirm_pickup_received($1)',[fakeId]), /permission denied/);
  } finally { await db.close(); }
});

test('browse_listings_with_certificates()/my_open_buy_requests()/my_sales()/my_purchases() all carry pickup fields', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, buyer]);
    const stationId=(await raw("select id from public.pickup_stations where jurisdiction='Cedar Park Police Department'")).rows[0].id;

    await as(seller);
    const itemPath = seller + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa9001.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
    const listingId=(await db.query(
      "select public.create_listing_with_details('Pickup browse fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$2,'{}','[]',8,8,6,4,false,'fixed',null,null,null,true,$1) as id",
      [stationId, JSON.stringify([{path:itemPath,kind:'item'}])]
    )).rows[0].id;
    const browsed=(await raw('select public.browse_listings_with_certificates() as items')).rows[0].items.find(i=>i.id===listingId);
    assert.equal(browsed.pickup_enabled,true);
    assert.equal(browsed.pickup_station.jurisdiction,'Cedar Park Police Department');

    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(buyer);
    const request=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[request.id]);

    await as(buyer);
    const openRequests=(await db.query('select public.my_open_buy_requests() as r')).rows[0].r;
    assert.equal(openRequests[0].pickup_enabled,true);
    assert.equal(openRequests[0].pickup_station.jurisdiction,'Cedar Park Police Department');

    const reservation=(await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r",[listingId])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_browse')",[reservation.checkout_session_id]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_browse','pi_test_browse') as id")).rows[0].id;

    await as(seller);
    const sale=(await db.query('select public.my_sales() as s')).rows[0].s.find(x=>x.id===purchaseId);
    assert.equal(sale.fulfillment_method,'pickup');
    assert.equal(sale.pickup_station.jurisdiction,'Cedar Park Police Department');

    await as(buyer);
    const purchase=(await db.query('select public.my_purchases() as p')).rows[0].p.find(x=>x.purchase_id===purchaseId);
    assert.equal(purchase.fulfillment_method,'pickup');
    assert.equal(purchase.pickup_station.jurisdiction,'Cedar Park Police Department');
  } finally { await db.close(); }
});
