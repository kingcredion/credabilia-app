import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050095_payout_holds_and_handoff.sql'];

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

test('Outbid, New Message, Item Shipped, Item Delivered, Refund Update and Dispute Update each email the right person, once, with no other party identity', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const buyer = '33333333-3333-4333-8333-333333333333';
  const bidder2 = '44444444-4444-4444-8444-444444444444';
  const operator = '55555555-5555-4555-8555-555555555555';
  const emails = {[seller]:'seller@example.test',[buyer]:'buyer@example.test',[bidder2]:'bidder2@example.test',[operator]:'operator@example.test'};
  try {
    for (const [id, email] of Object.entries(emails)) await raw('insert into auth.users(id,email) values($1,$2)', [id, email]);
    await raw('insert into public.operators(user_id) values($1)', [operator]);
    await raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
    let n = 0;
    const mkListing = async (type, extra) => {
      n += 1;
      const path = seller + '/aaaaaaaaaaa' + n + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
      await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
      await as(seller);
      const id = (await db.query("select public.create_listing_with_details('Signed Ball','A fictional listing for testing.','Sports',12345,'',null,null,null,$1,'{}','[]',8,8,6,4,false,$2,$3,null,null) as id", [JSON.stringify([{path, kind:'item'}]), type, extra])).rows[0].id;
      await raw("update public.listings set status='active' where id=$1", [id]);
      return id;
    };
    const events = async () => {
      const rows = (await raw("select body from net._http_calls where url like '%klaviyo%' order by id")).rows;
      await raw('delete from net._http_calls');
      return rows.map(r => ({name: r.body.data.attributes.metric.data.attributes.name, email: r.body.data.attributes.profile.data.attributes.email, props: r.body.data.attributes.properties}));
    };
    const noLeak = (list) => assert.ok(!JSON.stringify(list.map(e => e.props)).match(/example\.test|@/), 'no email address inside any event properties');

    // --- Outbid: previous high bidder only ---
    const auction = await mkListing('auction', 3);
    await raw('delete from net._http_calls');
    await as(buyer); await db.query('select public.place_bid($1,$2)', [auction, 12345]);
    assert.equal((await events()).length, 0, 'the first bid outbids nobody');
    await as(bidder2); await db.query('select public.place_bid($1,$2)', [auction, 13000]);
    let ev = await events();
    assert.equal(ev.length, 1);
    assert.equal(ev[0].name, 'Outbid'); assert.equal(ev[0].email, 'buyer@example.test');
    assert.equal(ev[0].props.title, 'Signed Ball'); assert.equal(ev[0].props.amount_display, '$130.00');

    // --- New Message: one email per unread streak, never the message text ---
    const fixed = await mkListing('fixed', null);
    await as(buyer);
    const conv = (await db.query('select public.get_or_create_conversation($1) as c', [fixed])).rows[0].c.id;
    await raw('delete from net._http_calls');
    await db.query("select public.send_message($1,'Is this still available? SECRETWORDS')", [conv]);
    await db.query("select public.send_message($1,'Hello again')", [conv]);
    ev = await events();
    assert.equal(ev.length, 1, 'two unread messages in a row send one email');
    assert.equal(ev[0].name, 'New Message'); assert.equal(ev[0].email, 'seller@example.test');
    assert.equal(ev[0].props.title, 'Signed Ball'); assert.ok(ev[0].props.conversation_url.endsWith('/?conversation=' + conv));
    assert.ok(!JSON.stringify(ev[0]).includes('SECRETWORDS'), 'message text is never emailed');
    await as(seller); await db.query('select public.mark_messages_read($1)', [conv]);
    await as(buyer); await db.query("select public.send_message($1,'One more thing')", [conv]);
    assert.equal((await events()).length, 1, 'after the seller reads, the next message emails again');

    // --- purchase for the shipping / refund scenarios ---
    const mkPurchase = async (listingId) => {
      await as(buyer);
      const c = (await db.query('select public.get_or_create_conversation($1) as c', [listingId])).rows[0].c.id;
      return (await raw("insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,platform_fee_cents,conversation_id) values($1,$2,$3,12345,1000,$4) returning id", [listingId, buyer, seller, c])).rows[0].id;
    };
    const purchase = await mkPurchase(fixed);
    await raw('delete from net._http_calls');

    // --- Item Shipped: buyer, once ---
    await as(seller, 'service_role');
    await db.query("select public.record_shipment($1,$2,'tx_1','TRACK123','https://track.example/TRACK123','https://label.example/1')", [purchase, seller]);
    ev = await events();
    assert.equal(ev.length, 1); assert.equal(ev[0].name, 'Item Shipped'); assert.equal(ev[0].email, 'buyer@example.test');
    assert.equal(ev[0].props.tracking_number, 'TRACK123'); assert.equal(ev[0].props.tracking_url, 'https://track.example/TRACK123');
    await db.query("select public.record_shipment($1,$2,'tx_1','TRACK123','https://track.example/TRACK123','https://label.example/1')", [purchase, seller]);
    assert.equal((await events()).length, 0, 'recording the same shipment again does not email again');

    // --- Item Delivered: buyer, only on the first DELIVERED ---
    await as(seller, 'service_role');
    await db.query("select public.update_tracking_status('TRACK123','TRANSIT')");
    assert.equal((await events()).length, 0, 'in-transit updates send nothing');
    await db.query("select public.update_tracking_status('TRACK123','DELIVERED')");
    await db.query("select public.update_tracking_status('TRACK123','DELIVERED')");
    ev = await events();
    assert.equal(ev.length, 1, 'repeat DELIVERED webhooks send one email');
    assert.equal(ev[0].name, 'Item Delivered'); assert.equal(ev[0].email, 'buyer@example.test');

    // --- Refund Update: request (seller), partial offer (buyer) ---
    await as(buyer);
    await db.query("select public.request_refund($1,'Arrived damaged.')", [purchase]);
    ev = await events();
    assert.equal(ev.length, 1); assert.equal(ev[0].name, 'Refund Update'); assert.equal(ev[0].email, 'seller@example.test');
    assert.equal(ev[0].props.headline, 'A refund was requested');
    const req = (await raw('select id from public.refund_requests where purchase_id=$1', [purchase])).rows[0].id;
    await as(seller);
    await db.query('select public.offer_partial_refund($1,$2)', [req, 5000]);
    ev = await events();
    assert.equal(ev.length, 1); assert.equal(ev[0].email, 'buyer@example.test'); assert.equal(ev[0].props.headline, 'A partial refund was offered');
    assert.ok(ev[0].props.message.includes('$50.00'));

    // --- Refund Update: refund issued, both parties ---
    await raw("update public.refund_requests set status='accepted' where id=$1", [req]);
    await as(seller, 'service_role');
    await db.query("select public.mark_refund_processed($1,'re_test')", [req]);
    ev = await events();
    assert.deepEqual(ev.map(e => e.email).sort(), ['buyer@example.test', 'seller@example.test']);
    assert.ok(ev.every(e => e.name === 'Refund Update' && e.props.message.includes('$50.00')));
    noLeak(ev);

    // --- Dispute Update: seller contests -> both; operator denies -> both ---
    const second = await mkListing('fixed', null);
    const purchase2 = await mkPurchase(second);
    await as(buyer); await db.query("select public.request_refund($1,'Not as described.')", [purchase2]);
    await events();
    const req2 = (await raw('select id from public.refund_requests where purchase_id=$1', [purchase2])).rows[0].id;
    await as(seller); await db.query("select public.respond_to_refund_request($1,false,'It matched the listing.')", [req2]);
    ev = await events();
    const disputes = ev.filter(e => e.name === 'Dispute Update');
    assert.deepEqual(disputes.map(e => e.email).sort(), ['buyer@example.test', 'seller@example.test']);
    assert.ok(ev.some(e => e.name === 'Admin Alert: New Dispute'), 'the operator alert still fires');
    noLeak(disputes);
    assert.ok(!JSON.stringify(disputes).includes('It matched the listing'), "the seller's response is not emailed to the buyer");
    await as(operator); await db.query("select public.admin_resolve_refund_request($1,'deny',null,'No evidence.')", [req2]);
    ev = await events();
    assert.deepEqual(ev.map(e => e.email).sort(), ['buyer@example.test', 'seller@example.test']);
    assert.ok(ev.every(e => e.name === 'Dispute Update'));
    assert.equal(ev.find(e => e.email === 'buyer@example.test').props.headline, 'Your refund request was not approved');
  } finally { await db.close(); }
});

test('a signup emails the new user their Welcome and alerts the operator, once each, and never blocks the signup', async () => {
  const { db, raw } = await freshDb();
  try {
    await raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
    await raw('delete from net._http_calls');
    const id = '77777777-7777-4777-8777-777777777777';
    await raw('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',
      [id, 'newperson@example.test', JSON.stringify({ full_name: 'Nia New' }), JSON.stringify({ provider: 'google' })]);
    const calls = (await raw("select body from net._http_calls where url like '%klaviyo%' order by id")).rows.map(r => ({
      name: r.body.data.attributes.metric.data.attributes.name,
      email: r.body.data.attributes.profile.data.attributes.email,
      props: r.body.data.attributes.properties }));
    assert.equal(calls.length, 2, 'one event for the user, one for the operator');
    const welcome = calls.find(c => c.name === 'Signed Up'), alert = calls.find(c => c.name === 'Admin Alert: New User');
    assert.equal(welcome.email, 'newperson@example.test');
    assert.equal(alert.email, 'kingcredion@credabilia.com');
    assert.equal(alert.props.user_email, 'newperson@example.test');
    assert.equal(alert.props.display_name, 'Nia New');
    assert.equal(alert.props.provider, 'google');
    assert.match(alert.props.signed_up_at, /PT$/);
    assert.equal((await raw('select count(*)::int n from public.profiles where id=$1', [id])).rows[0].n, 1, 'the profile was still created');
  } finally { await db.close(); }
});
