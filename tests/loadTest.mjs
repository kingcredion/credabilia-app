// Internal load/loop test: exercises the full backend feature surface (listing creation, browse
// pagination, buy-request handshake, checkout, ship + pickup fulfillment, messaging, ratings,
// refunds/disputes, audit queue, reports/blocks/admin resolution, relisting, notifications,
// credibility scoring) against an in-memory PGlite Postgres -- no real Stripe/Shippo/OpenAI/xAI
// network calls, no real Supabase/Apple/Google accounts. Synthetic users are plain UUIDs inserted
// straight into auth.users, the same trick every tests/*.test.js file already uses.
//
// Run: node tests/loadTest.mjs            (defaults to 20 full listing lifecycles)
//      LOAD_N=100 node tests/loadTest.mjs  (bigger run)
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {createHandler as createDraftListingHandler} from '../supabase/functions/draft-listing/handler.js';

const N = Number(process.env.LOAD_N || 20);
const OPERATOR = 'a9028fe8-c514-47bd-a873-ccd78251783a';
const ADDRESS = {name: 'Sam Seller', street1: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704', country: 'US'};

const ALL_MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609160008_listing_draft.sql','202609170009_trivia.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609250020_service_role_escrow_grants.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609270023_service_role_refund_grant.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300026_reserve_legal_slugs.sql','202609300027_credibility_low_default.sql','202609300028_background_removal_quota.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300037_credion_coins.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300051_anon_purchases_grant_for_media_visibility.sql','202609300052_service_role_listing_media_grant.sql','202609300053_operator_quota_exemption.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql'];
// The 5 omitted *_schedule.sql migrations only wire up pg_cron jobs -- PGlite has no pg_cron/pg_net
// scheduler, same reason every existing tests/*.test.js file excludes them too.

async function freshDb() {
  const db = new PGlite({extensions: {vector}});
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
  for (const file of ALL_MIGRATIONS) {
    try {
      await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    } catch (err) {
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return {db, as, raw};
}

const stats = {};
function tick(name) { stats[name] = (stats[name] || 0) + 1; }

let photoCounter = 0;
function photoPath(uid) {
  photoCounter++;
  return uid + `/aaaaaaaa-aaaa-4aaa-8aaa-${String(photoCounter).padStart(12, '0')}.png`;
}

async function main() {
  const t0 = performance.now();
  const {db, as, raw} = await freshDb();
  const bootTime = performance.now() - t0;
  console.log(`[boot] ${ALL_MIGRATIONS.length} migrations loaded in ${bootTime.toFixed(0)}ms`);

  // Seed the operator (trust & safety) and a floating auditor pool up front.
  await raw('insert into auth.users(id,email) values($1,$2)', [OPERATOR, 'kingcredion@credabilia.com']);
  await raw('insert into public.operators(user_id) values($1) on conflict do nothing', [OPERATOR]);
  tick('operator_seeded');

  const listingIds = [];
  const activeListingIds = []; // listings that should still be unsold/browsable by the end of the run
  const purchaseIds = [];
  const errors = [];

  const tLoop0 = performance.now();
  for (let i = 0; i < N; i++) {
    const seller = randomUUID();
    const buyer = randomUUID();
    const label = `#${i}`;
    try {
      await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, `seller${i}@load.test`, buyer, `buyer${i}@load.test`]);
      tick('users_created');

      // --- Listing creation (alternate: plain / signed / pickup-enabled) ---
      const wantsSignature = i % 3 === 0;
      const wantsPickup = i % 4 === 0;
      await as(seller);
      const itemPath = photoPath(seller);
      await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
      const media = [{path: itemPath, kind: 'item'}];
      if (wantsSignature) {
        const sigPath = photoPath(seller);
        await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [sigPath]);
        media.push({path: sigPath, kind: 'signature'});
      }
      let pickupStationId = null;
      if (wantsPickup) {
        pickupStationId = (await raw('select id from public.pickup_stations order by random() limit 1')).rows[0].id;
      }
      const priceCents = 2000 + i * 137;
      const listingId = (await db.query(
        `select public.create_listing_with_details($1,'A load-test fixture listing.','Sports',$2,'',null,null,null,$3,$4,'[]',8,8,6,4,false,'fixed',null,null,null,$5,$6) as id`,
        [`Load test item ${label}`, priceCents, JSON.stringify(media), JSON.stringify(wantsSignature ? {subject: 'Test Athlete'} : {}), !!pickupStationId, pickupStationId]
      )).rows[0].id;
      listingIds.push(listingId);
      tick('listings_created');
      if (wantsSignature) tick('listings_with_signature');
      if (wantsPickup) tick('listings_pickup_enabled');

      await db.query('select public.save_shipping_address($1)', [ADDRESS]);
      await db.query('select public.save_stripe_account($1)', [`acct_test_load_${i}`]);
      await as(seller, 'service_role');
      await db.query('select public.update_stripe_account_status($1,true,true)', [`acct_test_load_${i}`]);
      tick('seller_stripe_ready');

      // --- Audit queue on ~1 in 4 listings, by a fresh unrelated auditor (must happen while the
      // listing is still active -- audits aren't available once it's sold) ---
      if (i % 4 === 1) {
        const auditor = randomUUID();
        await raw('insert into auth.users(id,email) values($1,$2)', [auditor, `auditor${i}@load.test`]);
        await as(auditor);
        await db.query('select public.submit_audit($1,$2,$3)', [listingId, i % 8 === 1 ? 'concerns' : 'authentic', 'Looks consistent with a load-test fixture.']);
        tick('audits_submitted');
      }

      // --- Browse visibility check ---
      await as(buyer);
      const browsed = (await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items;
      assert.ok(browsed.some(x => x.id === listingId), `[${label}] new listing not visible in browse`);
      tick('browse_checks');

      // --- Buyer/seller availability handshake ---
      const buyReq = (await db.query('select public.request_to_buy($1) as r', [listingId])).rows[0].r;
      tick('buy_requests');
      await as(seller);
      await db.query('select public.respond_to_buy_request($1,true)', [buyReq.id]);
      tick('buy_requests_confirmed');

      // --- Checkout (alternate ship / pickup) ---
      await as(buyer);
      const fulfillment = wantsPickup ? 'pickup' : 'ship';
      const reservation = wantsPickup
        ? (await db.query("select public.reserve_listing_checkout($1,null,0,true,'pickup') as r", [listingId])).rows[0].r
        : (await db.query('select public.reserve_listing_checkout($1,$2) as r', [listingId, ADDRESS])).rows[0].r;
      tick('checkouts_reserved');
      await db.query('select public.attach_stripe_checkout_session($1,$2,$3,$4)', [reservation.checkout_session_id, `cs_test_load_${i}`, 500, wantsPickup ? 0 : 150]);
      await as(buyer, 'service_role');
      const purchaseId = (await db.query('select public.finalize_checkout_session($1,$2) as id', [`cs_test_load_${i}`, `pi_test_load_${i}`])).rows[0].id;
      purchaseIds.push({purchaseId, seller, buyer, listingId, fulfillment});
      tick('purchases_finalized');

      // --- Messaging: buyer opens thread, seller replies, both mark read ---
      await as(buyer);
      const convo = (await db.query('select public.get_or_create_conversation($1) as c', [listingId])).rows[0].c;
      await db.query('select public.send_message($1,$2)', [convo.id, 'Hi! Excited about this one.']);
      tick('messages_sent');
      await as(seller);
      await db.query('select public.send_message($1,$2)', [convo.id, 'Thanks, shipping it out soon!']);
      await db.query('select public.mark_messages_read($1)', [convo.id]);
      tick('messages_sent');
      await as(buyer);
      await db.query('select public.get_messages($1) as m', [convo.id]);
      await db.query('select public.mark_messages_read($1)', [convo.id]);
      tick('conversations_completed');

      // --- Fulfillment + escrow release (simulating what the Shippo webhook / confirm-pickup
      // edge function would do after a REAL delivery signal -- no network call here) ---
      if (wantsPickup) {
        await as(seller);
        await db.query('select public.mark_picked_up($1)', [purchaseId]);
        await as(buyer);
        await db.query('select public.confirm_pickup_received($1)', [purchaseId]);
        await raw("select public.mark_purchase_released($1,$2)", [purchaseId, `tr_test_load_${i}`]);
        tick('pickup_completed');
      } else {
        await as(seller);
        await db.query('select public.record_shipment($1,$2,$3,$4,$5)', [purchaseId, `shippo_test_${i}`, `TRACK${i}`, `https://track.test/${i}`, `https://label.test/${i}`]);
        await raw("select public.mark_purchase_released($1,$2)", [purchaseId, `tr_test_load_${i}`]);
        tick('shipments_delivered');
      }

      // --- Rating ---
      await as(buyer);
      await db.query('select public.rate_seller($1,$2,$3)', [purchaseId, 4 + (i % 2), 'Smooth transaction.']);
      tick('ratings_submitted');

      // --- Refund/dispute on ~1 in 5 purchases ---
      if (i % 5 === 0) {
        await as(buyer);
        await db.query('select public.request_refund($1,$2)', [purchaseId, 'Item not as described.']);
        tick('refunds_requested');
        await as(seller);
        if (i % 10 === 0) {
          const req = (await raw('select id from public.refund_requests where purchase_id=$1', [purchaseId])).rows[0];
          await db.query('select public.offer_partial_refund($1,$2,$3)', [req.id, Math.round(priceCents * 0.3), 'Here is a partial refund.']);
          await as(buyer);
          await db.query('select public.respond_to_partial_offer($1,$2)', [req.id, true]);
          tick('refunds_partial_accepted');
        } else {
          const req = (await raw('select id from public.refund_requests where purchase_id=$1', [purchaseId])).rows[0];
          await db.query('select public.respond_to_refund_request($1,$2,$3)', [req.id, true, 'Approved, sorry about that.']);
          tick('refunds_accepted');
        }
        await raw('select public.mark_refund_processed($1,$2)', [(await raw('select id from public.refund_requests where purchase_id=$1', [purchaseId])).rows[0].id, `re_test_load_${i}`]);
        tick('refunds_processed');
      }

      // --- Report + operator resolution on ~1 in 10 listings ---
      if (i % 10 === 3) {
        const reporter = randomUUID();
        await raw('insert into auth.users(id,email) values($1,$2)', [reporter, `reporter${i}@load.test`]);
        await as(reporter);
        const report = (await db.query("select public.report_content('listing',$1,$2,$3) as r", [listingId, 'Suspicious listing', 'Flagged by load test.'])).rows[0].r;
        tick('reports_filed');
        await as(OPERATOR);
        await db.query('select public.admin_resolve_report($1,$2,$3,false)', [report.id, 'resolved', 'Reviewed, no action needed.']);
        tick('reports_resolved');
      }

      // --- Block/unblock on ~1 in 10 buyers, exercised against a throwaway stranger ---
      if (i % 10 === 7) {
        const stranger = randomUUID();
        await raw('insert into auth.users(id,email) values($1,$2)', [stranger, `stranger${i}@load.test`]);
        await as(buyer);
        await db.query('select public.block_user($1)', [stranger]);
        await db.query('select public.my_blocked_users() as b');
        await db.query('select public.unblock_user($1)', [stranger]);
        tick('block_unblock_cycles');
      }

      // --- Relist: the buyer becomes a seller of the same physical item ---
      const purchaseRow = (await raw('select p.price_cents,l.weight_oz,l.length_in,l.width_in,l.height_in from public.purchases p join public.listings l on l.id=p.listing_id where p.id=$1', [purchaseId])).rows[0];
      await as(buyer);
      const relistPath = photoPath(buyer);
      await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [relistPath]);
      const relistedId = (await db.query(
        `select public.create_listing_with_details($1,'Relisted via load test.','Sports',$2,'',null,null,null,$3,'{}','[]',$4,$5,$6,$7,false,'fixed',null,null,null,false,null) as id`,
        [`Relisted item ${label}`, Math.round(purchaseRow.price_cents * 1.15), JSON.stringify([{path: relistPath, kind: 'item'}]), purchaseRow.weight_oz, purchaseRow.length_in, purchaseRow.width_in, purchaseRow.height_in]
      )).rows[0].id;
      await db.query('select public.mark_listing_relisted($1,$2)', [relistedId, purchaseId]);
      listingIds.push(relistedId);
      activeListingIds.push(relistedId); // the original listingId is sold by now and won't browse; only the relist stays active
      tick('relists_completed');

      if ((i + 1) % Math.max(1, Math.floor(N / 5)) === 0) {
        console.log(`[progress] ${i + 1}/${N} full lifecycles complete`);
      }
    } catch (err) {
      errors.push({iteration: i, message: err.message});
      console.error(`[FAIL] iteration ${label}: ${err.message}`);
    }
  }
  const loopTime = performance.now() - tLoop0;

  // --- Post-loop cross-cutting checks: pagination, credibility, notifications ---
  console.log('[checks] pagination / credibility / notifications');
  await as(randomUUID()); // any authenticated stranger can browse
  let seen = new Set(), cursor = null, pages = 0;
  while (true) {
    const rows = cursor
      ? (await db.query('select id,created_at from public.browse_listings(5,$1,$2) order by created_at desc,id desc', [cursor.created_at, cursor.id])).rows
      : (await db.query('select id,created_at from public.browse_listings(5) order by created_at desc,id desc')).rows;
    pages++;
    if (rows.length === 0) break;
    for (const r of rows) seen.add(r.id);
    cursor = rows[rows.length - 1];
    if (pages > (listingIds.length / 5 + 5)) throw new Error('pagination did not terminate -- possible cursor bug');
  }
  for (const id of activeListingIds) assert.ok(seen.has(id), `active (unsold, relisted) listing ${id} missing from paginated browse results`);
  const soldOriginal = purchaseIds[0]?.listingId;
  if (soldOriginal) assert.ok(!seen.has(soldOriginal), 'a sold listing should not appear in browse_listings');
  tick('pagination_pages_walked');
  console.log(`[checks] pagination walked ${pages} pages, saw ${seen.size} browsable listings (${activeListingIds.length} expected still-active relists all present; sold originals correctly excluded)`);

  const scored = (await raw('select public.browse_scored_listings() as items')).rows[0].items;
  assert.ok(Array.isArray(scored) && scored.length > 0);
  assert.ok(scored.every(x => typeof x.credibility_score === 'number'), 'every browsed listing should carry a numeric credibility_score');
  console.log(`[checks] credibility scoring present on all ${scored.length} scored listings`);

  let notifErrors = 0;
  for (const {seller, buyer} of purchaseIds.slice(0, Math.min(10, purchaseIds.length))) {
    await as(seller);
    await db.query('select public.my_notifications() as n');
    await as(buyer);
    await db.query('select public.my_notifications() as n');
  }
  console.log(`[checks] my_notifications() sampled cleanly for ${Math.min(10, purchaseIds.length)} seller/buyer pairs (${notifErrors} errors)`);

  // --- Edge-function layer smoke test: draft-listing's AI path, in-process, zero network ---
  console.log('[checks] draft-listing edge function (fake OpenAI client, no network)');
  const draftId = randomUUID();
  await raw('insert into auth.users(id,email) values($1,$2)', [draftId, 'drafter@load.test']);
  const draftPath = draftId + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const draftHandler = createDraftListingHandler({
    env: key => (key === 'OPENAI_API_KEY' ? 'test-key' : 'test'),
    createClient: () => ({
      auth: {getUser: async () => ({data: {user: {id: draftId}}})},
      storage: {from: () => ({download: async () => ({data: new Blob([new Uint8Array([255, 216, 255, 0])], {type: 'image/jpeg'})})})},
      rpc: async () => ({error: null}),
    }),
    fetcher: async () => Response.json({
      status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({
        title: 'Load test drafted item', description: 'Drafted without hitting a real API.', category: 'Sports',
        attributes: {item_type: 'Card', subject: null, year: '2024', condition: null, sport: 'Baseball', team: null, artist: null, medium: null, dimensions: null, publisher: null, issue: null, grading_company: null, grade: null},
        tags: ['loadtest'], signature: {found: false, box: null},
      })}]}],
    }),
  });
  const draftRes = await draftHandler(new Request('https://example.test', {method: 'POST', headers: {Authorization: 'Bearer test'}, body: JSON.stringify({notes: 'a baseball card', photo_path: draftPath})}));
  assert.equal(draftRes.status, 200);
  const draftJson = await draftRes.json();
  assert.equal(draftJson.title, 'Load test drafted item');
  tick('draft_listing_edge_calls');
  console.log('[checks] draft-listing handler returned a clean draft with no network call');

  const totalTime = performance.now() - t0;
  console.log('\n=== LOAD TEST SUMMARY ===');
  console.log(`requested lifecycles: ${N}`);
  console.log(`boot time: ${bootTime.toFixed(0)}ms, loop time: ${loopTime.toFixed(0)}ms, total: ${totalTime.toFixed(0)}ms`);
  console.log(`throughput: ${(N / (loopTime / 1000)).toFixed(2)} full listing lifecycles/sec`);
  console.log('operation counts:');
  for (const [k, v] of Object.entries(stats).sort()) console.log(`  ${k}: ${v}`);
  console.log(`errors: ${errors.length}`);
  if (errors.length) {
    for (const e of errors) console.log(`  iteration ${e.iteration}: ${e.message}`);
  }
  await db.close();

  if (errors.length > 0) {
    console.log('\nRESULT: FAIL');
    process.exitCode = 1;
  } else {
    console.log('\nRESULT: PASS -- all backend features exercised with no real external API calls or real accounts.');
  }
}

main().catch(err => {
  console.error('Load test crashed:', err);
  process.exitCode = 1;
});
