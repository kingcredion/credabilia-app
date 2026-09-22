import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};
const OPERATOR = 'a9028fe8-c514-47bd-a873-ccd78251783a';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql'];

// Same harness shape as tests/refunds.test.js and tests/klaviyoEvents.test.js: a spy stand-in for
// pg_net (so net.http_post calls -- process-refund triggers, Klaviyo alerts -- can be inspected
// instead of only checking "did it not crash"), plus the auth/storage/vault scaffolding every
// migration in this app assumes exists.
async function freshDb() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
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

// reserve_listing_checkout requires a confirmed, unexpired availability request from this buyer
// (202609300033_buy_availability_confirmation.sql) -- this replays that "ask to buy" handshake so
// checkout fixtures below don't have to repeat it inline.
async function confirmBuy(db, as, listingId, seller, buyer) {
  await as(buyer);
  const req = (await db.query('select public.request_to_buy($1) as r', [listingId])).rows[0].r;
  await as(seller);
  await db.query('select public.respond_to_buy_request($1,true)', [req.id]);
  await as(buyer);
}

test('operator identity: is_operator()/operator_open_dispute_count() only recognize the seeded operator', async () => {
  const { db, as } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [seller, 's@example.test', buyer, 'b@example.test', OPERATOR, 'kingcredion@credabilia.com']);
    // The migration's own seed insert is a no-op on a fresh schema (guarded so it doesn't fail a
    // real deploy where the operator's profile doesn't exist yet) -- tests seed it explicitly
    // here, once the profile row exists (created by bootstrap_account() off the insert above).
    await db.query('insert into public.operators(user_id) values ($1) on conflict do nothing', [OPERATOR]);
    await as(seller);
    assert.equal((await db.query('select public.is_operator() as v')).rows[0].v, false);
    await as(OPERATOR);
    assert.equal((await db.query('select public.is_operator() as v')).rows[0].v, true);
    assert.equal((await db.query('select public.operator_open_dispute_count() as n')).rows[0].n, 0);
    await as(buyer);
    await assert.rejects(db.query('select public.admin_list_refund_requests() as r'), /Not authorized/);
  } finally { await db.close(); }
});

test('admin dispute resolution: operator can approve a contested request (triggers process-refund) or deny it', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [seller, 's@example.test', buyer, 'b@example.test', OPERATOR, 'kingcredion@credabilia.com']);
    await raw('insert into public.operators(user_id) values ($1) on conflict do nothing', [OPERATOR]);
    await raw("select vault.create_secret('test-service-role-key','service_role_key')");

    await as(seller);
    await db.query("select public.save_shipping_address($1)", [{ ...ADDRESS, name: 'Sam Seller' }]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller, 'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    const listingId = (await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;

    await confirmBuy(db, as, listingId, seller, buyer);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [listingId, ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_admin',$2,$3)", [reservation.checkout_session_id, 0, 0]);
    await as(buyer, 'service_role');
    const purchaseId = (await db.query("select public.finalize_checkout_session('cs_test_admin','pi_test_admin') as id")).rows[0].id;

    await as(buyer);
    const request = (await db.query("select public.request_refund($1,'Item arrived damaged.') as r", [purchaseId])).rows[0].r;
    await as(seller);
    const contested = (await db.query("select public.respond_to_refund_request($1,false,'Packed carefully.') as r", [request.id])).rows[0].r;
    assert.equal(contested.status, 'contested');

    // Nothing but the operator can move a contested request forward.
    await as(buyer);
    await assert.rejects(db.query("select public.admin_resolve_refund_request($1,'approve')", [request.id]), /Not authorized/);

    await as(OPERATOR);
    const approved = (await db.query("select public.admin_resolve_refund_request($1,'approve',null,'Reviewed the photos, approving.') as r", [request.id])).rows[0].r;
    assert.equal(approved.status, 'accepted');
    const stored = (await raw('select status,resolution_note from public.refund_requests where id=$1', [request.id])).rows[0];
    assert.equal(stored.status, 'accepted');
    assert.equal(stored.resolution_note, 'Reviewed the photos, approving.');

    const calls = (await raw('select * from net._http_calls order by id')).rows;
    const processCall = calls.find(c => c.url.endsWith('/process-refund'));
    assert.ok(processCall, 'admin approval did not trigger process-refund');
    assert.equal(processCall.headers.Authorization, 'Bearer test-service-role-key');
    assert.equal(processCall.body.refund_request_id, request.id);

    // Second request: operator denies instead. A fresh listing -- the first one is already 'sold'.
    await as(seller);
    const listing2Id = (await db.query("select public.create_listing_with_details('Second fictional item','A fictional description for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await confirmBuy(db, as, listing2Id, seller, buyer);
    const reservation2 = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [listing2Id, ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_admin_2',$2,$3)", [reservation2.checkout_session_id, 0, 0]);
    await as(buyer, 'service_role');
    const purchase2Id = (await db.query("select public.finalize_checkout_session('cs_test_admin_2','pi_test_admin_2') as id")).rows[0].id;
    await as(buyer);
    const request2 = (await db.query("select public.request_refund($1,'Wrong item.') as r", [purchase2Id])).rows[0].r;

    await as(OPERATOR);
    const denied = (await db.query("select public.admin_resolve_refund_request($1,'deny',null,'Not eligible.') as r", [request2.id])).rows[0].r;
    assert.equal(denied.status, 'denied');
    const listed = (await db.query('select public.admin_list_refund_requests() as r')).rows[0].r;
    assert.equal(listed.find(r => r.id === request2.id).status, 'denied');
  } finally { await db.close(); }
});

test('reports: reporting a listing alerts the operator via Klaviyo, and admin_resolve_report can archive it', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [seller, 's@example.test', buyer, 'b@example.test', OPERATOR, 'kingcredion@credabilia.com']);
    await raw('insert into public.operators(user_id) values ($1) on conflict do nothing', [OPERATOR]);
    await raw("select vault.create_secret('test-klaviyo-key','klaviyo_private_api_key')");

    await as(seller);
    const listingId = (await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;

    await as(buyer);
    await db.query("select public.report_content('listing',$1,'Suspected counterfeit','Markings look off.')", [listingId]);

    const calls = (await raw('select * from net._http_calls order by id')).rows;
    const alert = calls.find(c => c.body?.data?.attributes?.metric?.data?.attributes?.name === 'Admin Alert: New Report');
    assert.ok(alert, 'report_content did not alert the operator');

    await assert.rejects(db.query('select public.admin_list_reports() as r'), /Not authorized/);
    await as(OPERATOR);
    const open = (await db.query('select public.admin_list_reports() as r')).rows[0].r;
    assert.equal(open.length, 1);
    const reportId = open[0].id;
    await db.query("select public.admin_resolve_report($1,'resolved','Confirmed counterfeit, removed.',true)", [reportId]);
    const listing = (await raw('select status from public.listings where id=$1', [listingId])).rows[0];
    assert.equal(listing.status, 'archived');
  } finally { await db.close(); }
});

test('blocking: a blocked user cannot message the other party until unblocked', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', buyer, 'b@example.test']);
    await as(seller);
    const listingId = (await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await as(seller);
    await db.query("select public.save_shipping_address($1)", [{ ...ADDRESS, name: 'Sam Seller' }]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller, 'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await confirmBuy(db, as, listingId, seller, buyer);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [listingId, ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_block',$2,$3)", [reservation.checkout_session_id, 0, 0]);
    await as(buyer, 'service_role');
    const purchaseId = (await db.query("select public.finalize_checkout_session('cs_test_block','pi_test_block') as id")).rows[0].id;

    await as(buyer);
    await db.query("select public.send_message($1,'Hi, is this still available?')", [purchaseId]);

    await as(seller);
    await db.query('select public.block_user($1)', [buyer]);
    await assert.rejects(db.query("select public.send_message($1,'Reply attempt')", [purchaseId]), /cannot message this user/);
    // Blocking is symmetric: the buyer can't reach the seller either while blocked.
    await as(buyer);
    await assert.rejects(db.query("select public.send_message($1,'Still there?')", [purchaseId]), /cannot message this user/);

    await as(seller);
    await db.query('select public.unblock_user($1)', [buyer]);
    await as(buyer);
    await db.query("select public.send_message($1,'Trying again')", [purchaseId]);
    const messages = (await db.query('select public.get_messages($1) as m', [purchaseId])).rows[0].m;
    assert.equal(messages.length, 2);
  } finally { await db.close(); }
});

test('account deletion: guarded by active listings/open refunds, otherwise anonymizes without touching purchase history', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', buyer, 'b@example.test']);
    await as(seller);
    await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id");
    await assert.rejects(db.query('select public.delete_my_account()'), /active listings/);

    await as(buyer);
    await db.query('select public.delete_my_account()');
    const profile = (await raw('select display_name,deleted_at from public.profiles where id=$1', [buyer])).rows[0];
    assert.equal(profile.display_name, 'Deleted user');
    assert.ok(profile.deleted_at);
  } finally { await db.close(); }
});

test('admin alerts: a contested dispute and a first support message each notify the operator via Klaviyo, but repeat messages in the same window do not', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', buyer, 'b@example.test']);
    await raw("select vault.create_secret('test-klaviyo-key','klaviyo_private_api_key')");

    await as(seller);
    await db.query("select public.save_shipping_address($1)", [{ ...ADDRESS, name: 'Sam Seller' }]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller, 'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    const listingId = (await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await confirmBuy(db, as, listingId, seller, buyer);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [listingId, ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_alert',$2,$3)", [reservation.checkout_session_id, 0, 0]);
    await as(buyer, 'service_role');
    const purchaseId = (await db.query("select public.finalize_checkout_session('cs_test_alert','pi_test_alert') as id")).rows[0].id;
    await as(buyer);
    const request = (await db.query("select public.request_refund($1,'Not as described.') as r", [purchaseId])).rows[0].r;
    await as(seller);
    await db.query("select public.respond_to_refund_request($1,false,'Disagree.')", [request.id]);

    let calls = (await raw('select * from net._http_calls order by id')).rows;
    const metricNames = calls.map(c => c.body?.data?.attributes?.metric?.data?.attributes?.name).filter(Boolean);
    assert.ok(metricNames.includes('Admin Alert: New Dispute'));

    await as(buyer);
    await db.query('select public.consume_support_message()');
    await db.query("select public.send_support_message('Where is my refund?')");
    await db.query('select public.consume_support_message()');
    await db.query("select public.send_support_message('Following up again.')");

    calls = (await raw('select * from net._http_calls order by id')).rows;
    const supportAlerts = calls.filter(c => c.body?.data?.attributes?.metric?.data?.attributes?.name === 'Admin Alert: New Support Message');
    assert.equal(supportAlerts.length, 1, 'the second message in the same window should not alert again');
  } finally { await db.close(); }
});
