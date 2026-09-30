import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};
const OPERATOR = 'a9028fe8-c514-47bd-a873-ccd78251783a';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql'];

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
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

async function publishListing(db, as, raw, seller, priceCents) {
  await as(seller);
  const itemPath = seller + '/aaaaaaaa-aaaa-4aaa-8aaa-' + Math.random().toString(16).slice(2).padStart(12,'0').slice(0,12) + '.png';
  await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
  const id = (await db.query(
    "select public.create_listing_with_details('King collection fixture','A fictional listing for testing.','Sports',$1,'',null,null,null,$2,'{}','[]',8,8,6,4,false,'fixed',null,null,null) as id",
    [priceCents, JSON.stringify([{path:itemPath,kind:'item'}])]
  )).rows[0].id;
  await db.query("select public.save_shipping_address($1)",[ADDRESS]);
  await db.query("select public.save_stripe_account($1)",['acct_test_'+seller.slice(0,8)]);
  await as(seller,'service_role');
  await db.query("select public.update_stripe_account_status($1,true,true)",['acct_test_'+seller.slice(0,8)]);
  return id;
}

test("browse_listings_with_certificates(): king_collection is true only for the seeded operator's listings", async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', OPERATOR, 'kingcredion@credabilia.com']);
    await raw('insert into public.operators(user_id) values($1)', [OPERATOR]);
    const normalId = await publishListing(db, as, raw, seller, 3000);
    const kingId = await publishListing(db, as, raw, OPERATOR, 5000);
    const items = (await raw('select public.browse_listings_with_certificates() as items')).rows[0].items;
    assert.equal(items.find(i => i.id === normalId).king_collection, false);
    assert.equal(items.find(i => i.id === kingId).king_collection, true);
  } finally { await db.close(); }
});

test('reserve_listing_checkout: buyer can purchase a King\'s Collection item with zero handshake, still requires it for a normal listing', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [seller, 's@example.test', buyer, 'b@example.test', OPERATOR, 'kingcredion@credabilia.com']);
    await raw('insert into public.operators(user_id) values($1)', [OPERATOR]);
    const normalId = await publishListing(db, as, raw, seller, 3000);
    const kingId = await publishListing(db, as, raw, OPERATOR, 5000);

    // A normal seller's listing still requires the ask-first handshake -- regression guard.
    await as(buyer);
    await assert.rejects(
      db.query('select public.reserve_listing_checkout($1,$2)', [normalId, ADDRESS]),
      /Ask the seller to confirm this item is still available before buying\./
    );

    // A King's Collection item skips it entirely -- no request_to_buy call anywhere in this test.
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [kingId, ADDRESS])).rows[0].r;
    assert.equal(reservation.price_cents, 5000);
    const listingStatus = (await raw('select status from public.listings where id=$1', [kingId])).rows[0].status;
    assert.equal(listingStatus, 'pending');

    // A second buyer can no longer reserve it once it's pending -- ordinary listings.status guard still applies.
    const buyer2 = '33333333-3333-4333-8333-333333333333';
    await raw('insert into auth.users(id,email) values($1,$2)', [buyer2, 'b2@example.test']);
    await as(buyer2);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2)', [kingId, ADDRESS]), /not available to buy/);

    // Full checkout completes normally from here -- finalize works the same as any other purchase.
    await as(buyer);
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_king')", [reservation.checkout_session_id]);
    await as(buyer, 'service_role');
    const purchaseId = (await db.query("select public.finalize_checkout_session('cs_test_king','pi_test_king') as id")).rows[0].id;
    const purchase = (await raw('select seller_id,price_cents,escrow_status from public.purchases where id=$1', [purchaseId])).rows[0];
    assert.equal(purchase.seller_id, OPERATOR);
    assert.equal(purchase.price_cents, 5000);
    assert.equal(purchase.escrow_status, 'held');
  } finally { await db.close(); }
});

test('reserve_listing_checkout: a stranger cannot fake their way into King status by listing under a non-operator account', async () => {
  const { db, as, raw } = await freshDb();
  const impostor = '44444444-4444-4444-8444-444444444444', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [impostor, 'i@example.test', buyer, 'b@example.test']);
    // Note: no insert into public.operators for `impostor` -- membership is the only signal checked.
    const id = await publishListing(db, as, raw, impostor, 4000);
    await as(buyer);
    await assert.rejects(
      db.query('select public.reserve_listing_checkout($1,$2)', [id, ADDRESS]),
      /Ask the seller to confirm this item is still available before buying\./
    );
  } finally { await db.close(); }
});
