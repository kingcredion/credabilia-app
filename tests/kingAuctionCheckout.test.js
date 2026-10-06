import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610050100_purchase_emails_and_pickup_meetup.sql','202610050101_admin_alert_new_order.sql','202610050102_ship_pending_notification.sql','202610050113_buyer_action_notifications.sql','202610050114_king_auctions_not_buyable_outright.sql'];

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


// A listing by the operator ("King Credion"): they skip the seller-confirms step, so the checkout reservation must not let that shortcut
// buy an AUCTION outright. Fixed-price King listings keep the shortcut.
async function kingListing(db, as, raw, { auction = false } = {}) {
  photoCounter++;
  const itemPath = IDS.operator + `/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(photoCounter).padStart(4, '0')}.png`;
  await as(IDS.operator);
  await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
  const id = (await db.query(
    "select public.create_listing_with_details('King fixture','A fictional listing for testing.','Sports',$1,'',null,null,null,$2,'{}','[]',8,8,6,4,false,$3,$4,null,null,false,null) as id",
    [auction ? 100 : 5000, JSON.stringify([{ path: itemPath, kind: 'item' }]), auction ? 'auction' : 'fixed', auction ? 3 : null]
  )).rows[0].id;
  await db.query('select public.save_shipping_address($1)', [{ ...ADDRESS, name: 'King Credion' }]);
  await db.query("select public.save_stripe_account('acct_test_king')");
  await as(IDS.operator, 'service_role');
  await db.query("select public.update_stripe_account_status('acct_test_king',true,true)");
  return id;
}

test('a King Credion auction cannot be bought outright at checkout, but a King fixed-price listing still can', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    const auction = await kingListing(db, as, raw, { auction: true });
    await as(IDS.buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2) as r', [auction, ADDRESS]), /up for auction/);
    const row = (await raw('select status from public.listings where id=$1', [auction])).rows[0];
    assert.equal(row.status, 'active', 'the refused attempt does not reserve the listing');
    assert.equal((await raw('select count(*)::int as n from public.checkout_sessions where listing_id=$1', [auction])).rows[0].n, 0);

    const fixed = await kingListing(db, as, raw, { auction: false });
    await as(IDS.buyer);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [fixed, ADDRESS])).rows[0].r;
    assert.ok(reservation.checkout_session_id, 'a King fixed-price listing is still bought outright');
  } finally { await db.close(); }
});
