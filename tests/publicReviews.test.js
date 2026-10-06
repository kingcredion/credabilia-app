import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610060132_public_reviews.sql'];

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

// Three finished purchases from the same seller, each rated by a different buyer name, so the public lists have something to show.
async function rated(db, as, raw) {
  const stationId = await setup(raw);
  await raw("update public.profiles set display_name='Sam Seller', slug='sam-seller' where id=$1", [IDS.seller]);
  await raw("update public.profiles set display_name='Pat Buyer Jones' where id=$1", [IDS.buyer]);
  const made = [];
  for (let i = 1; i <= 3; i++) {
    const purchase = await makePurchase(db, as, raw, { price: 5000 + i });
    await as(IDS.buyer);
    const rating = (await db.query('select public.rate_seller($1,$2,$3) as r', [purchase, i + 2, i === 3 ? null : 'Comment number ' + i])).rows[0].r;
    made.push({ purchase, ratingId: rating.id, stars: i + 2 });
  }
  return { stationId, made };
}

test('reviews are public with a first-name-and-initial reviewer, the item bought, and "show more" paging', async () => {
  const { db, as, raw } = await freshDb();
  try {
    const { made } = await rated(db, as, raw);
    await raw('select 1');
    // signed out
    await db.exec('reset role'); await db.exec('set role anon');
    const store = (await db.query("select public.get_storefront('Sam-Seller') as s")).rows[0].s;
    assert.equal(store.rating_count, 3);
    assert.equal(Number(store.rating_avg), 4);
    assert.equal(store.reviews.length, 3);
    assert.equal(store.reviews[0].reviewer, 'Pat J.', 'the buyer is shown as first name and last initial');
    assert.ok(!JSON.stringify(store).includes('Pat Buyer Jones'), 'the full display name is never public');
    assert.ok(store.reviews.every(r => r.item_title), 'each review names the item that was bought');
    assert.equal(store.reviews[0].comment, null, 'a rating with no comment is allowed');

    const first = (await db.query("select public.get_seller_reviews('sam-seller',2,0) as r")).rows[0].r;
    const second = (await db.query("select public.get_seller_reviews('sam-seller',2,2) as r")).rows[0].r;
    assert.equal(first.reviews.length, 2); assert.equal(second.reviews.length, 1);
    assert.equal(first.rating_count, 3);
    assert.equal((await db.query("select public.get_seller_reviews('nobody') as r")).rows[0].r, null);
    assert.equal((await db.query("select public.get_seller_reviews('sam-seller',500,0) as r")).rows[0].r.reviews.length, 3, 'a huge page size is capped, not an error');

    const listing = (await raw('select listing_id from public.purchases where id=$1', [made[0].purchase])).rows[0].listing_id;
    await db.exec('reset role'); await db.exec('set role anon');
    const item = (await db.query('select public.get_listing_seller_reviews($1) as r', [listing])).rows[0].r;
    assert.equal(item.slug, 'sam-seller'); assert.equal(item.reviews.length, 3); assert.equal(item.seller_name, 'Sam Seller');
    const limited = (await db.query('select public.get_listing_seller_reviews($1,1) as r', [listing])).rows[0].r;
    assert.equal(limited.reviews.length, 1);
    const pageTwo = (await db.query('select public.get_listing_seller_reviews($1,2,2) as r', [listing])).rows[0].r;
    assert.equal(pageTwo.reviews.length, 1, "the item page can page through the seller's reviews too");
    assert.equal(pageTwo.rating_count, 3);
    await assert.rejects(db.query('select * from public.seller_ratings'), /permission denied/, 'the raw table stays private');
  } finally { await db.close(); }
});

test('anyone signed in can report a review; an operator hides it and it leaves the list AND the average; only operators can', async () => {
  const { db, as, raw } = await freshDb();
  try {
    const { made } = await rated(db, as, raw);
    const target = made[2]; // the 5-star one
    await db.exec('reset role'); await db.exec('set role anon');
    await assert.rejects(db.query("select public.report_content('review',$1,'Abusive')", [target.ratingId]), /permission denied/, 'signed out cannot report');

    await as(IDS.stranger);
    await assert.rejects(db.query("select public.report_content('review','99999999-9999-4999-8999-999999999999','Abusive')"), /Review not found/);
    const report = (await db.query("select public.report_content('review',$1,'Abusive or unfair','Not a real customer') as r", [target.ratingId])).rows[0].r;
    await assert.rejects(db.query("select public.admin_list_reports()"), /Not authorized/, 'a member cannot read the report queue');
    await assert.rejects(db.query("select public.admin_resolve_report($1,'resolved',null,true)", [report.id]), /Not authorized/);

    await as(IDS.operator);
    const queue = (await db.query("select public.admin_list_reports('open') as r")).rows[0].r;
    const entry = queue.find(r => r.id === report.id);
    assert.equal(entry.target_type, 'review');
    assert.equal(entry.review.rating, target.stars); assert.equal(entry.review.reviewer_name, 'Pat Buyer Jones'); assert.equal(entry.review.seller_name, 'Sam Seller');
    assert.equal(entry.review.hidden, false);

    await db.query("select public.admin_resolve_report($1,'resolved','Fake review',true)", [report.id]);
    await db.exec('reset role'); await db.exec('set role anon');
    const store = (await db.query("select public.get_storefront('sam-seller') as s")).rows[0].s;
    assert.equal(store.reviews.length, 2, 'the hidden review is gone from the public list');
    assert.equal(store.rating_count, 2);
    assert.equal(Number(store.rating_avg), 3.5, 'and from the average (3 and 4 stars)');
    const browse = (await raw('select public.browse_listings_with_certificates() as b')).rows[0].b;
    assert.ok(browse.every(i => i.seller_rating_count === undefined || i.seller_rating_count <= 2), 'listing cards use the corrected count');
    await as(IDS.stranger);
    await assert.rejects(db.query("select public.report_content('review',$1,'Again')", [target.ratingId]), /Review not found/, 'a hidden review cannot be reported again');

    // dismissing a review report (without removing) leaves the review up
    await as(IDS.buyer);
    await raw('select 1');
    await as(IDS.stranger);
    const other = (await db.query("select public.report_content('review',$1,'Disagree') as r", [made[0].ratingId])).rows[0].r;
    await as(IDS.operator);
    await db.query("select public.admin_resolve_report($1,'dismissed')", [other.id]);
    await db.exec('reset role'); await db.exec('set role anon');
    assert.equal((await db.query("select public.get_storefront('sam-seller') as s")).rows[0].s.reviews.length, 2, 'dismissed: nothing hidden');
  } finally { await db.close(); }
});
