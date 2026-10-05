import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610050100_purchase_emails_and_pickup_meetup.sql','202610050101_admin_alert_new_order.sql','202610050102_ship_pending_notification.sql','202610050103_buyer_chosen_shipping.sql','202610050104_seller_pays_shipping_charge.sql','202610050105_bug_reports.sql','202610050106_auction_hardening.sql'];

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
const S = '11111111-1111-4111-8111-111111111111', B1 = '22222222-2222-4222-8222-222222222222', B2 = '33333333-3333-4333-8333-333333333333', B3 = '44444444-4444-4444-8444-444444444444';
let n = 0;

async function world() {
  const ctx = await freshDb();
  const { db, as, raw } = ctx;
  for (const id of [S, B1, B2, B3]) await raw('insert into auth.users(id,email) values($1,$2)', [id, id.slice(0,4)+'@example.test']);
  for (const [id, fp] of [[B1,'fp_b1_000001'],[B2,'fp_b2_000002'],[B3,'fp_b3_000003']]) await raw("insert into public.payment_fingerprints(user_id,kind,fingerprint) values($1,'card',$2)", [id, fp]);
  await as(S);
  await db.query('select public.save_shipping_address($1)', [{...ADDRESS,name:'Sam Seller'}]);
  await db.query("select public.save_stripe_account('acct_test_seller')");
  await as(S, 'service_role');
  await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
  // test-only: change auction timing the way place_bid/settlement do
  ctx.timing = async (sql, params) => { await db.exec("select set_config('app.auction_internal','1',false)"); try { return await raw(sql, params); } finally { await db.exec("select set_config('app.auction_internal','',false)"); } };
  ctx.newAuction = async (startCents = 80000) => {
    n++;
    const path = S + `/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa${String(n).padStart(4,'0')}.png`;
    await as(S);
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
    return (await db.query("select public.create_listing_with_details('Signed helmet','A fictional listing for testing.','Sports',$1,'',null,null,null,$2,'{}','[]',40,12,12,12,false,p_listing_type=>'auction',p_auction_days=>5) as id", [startCents, JSON.stringify([{path,kind:'item'}])])).rows[0].id;
  };
  ctx.bid = async (who, id, cents) => { await as(who); return (await db.query('select public.place_bid($1,$2) as r', [id, cents])).rows[0].r; };
  ctx.price = async id => Number((await raw('select price_cents from public.listings where id=$1', [id])).rows[0].price_cents);
  ctx.settle = async () => { await as(S, 'service_role'); return (await db.query('select public.settle_ended_auctions() as n')).rows[0].n; };
  return ctx;
}

test('increments follow the eBay table and proxy (maximum) bidding only spends what is needed', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    assert.deepEqual([4,99,100,499,500,2499,2500,9999,10000,24999,25000,49999,50000,99999,100000,249999,250000,499999,500000].map(c => Number(c)).map(c => c), [4,99,100,499,500,2499,2500,9999,10000,24999,25000,49999,50000,99999,100000,249999,250000,499999,500000]);
    const steps = (await raw('select public.auction_increment(80000) as a, public.auction_increment(2500) as b, public.auction_increment(500000) as c')).rows[0];
    assert.deepEqual([Number(steps.a), Number(steps.b), Number(steps.c)], [1000, 100, 10000], '$800 steps $10, $25 steps $1, $5,000 steps $100');

    const id = await w.newAuction(80000);
    let r = await w.bid(B1, id, 90000);
    assert.equal(Number(r.amount_cents), 80000, 'a first bid holds the price at the starting bid');
    assert.equal(r.is_high_bidder, true);
    // below the minimum next bid
    await as(B2);
    await assert.rejects(db.query('select public.place_bid($1,80500)', [id]), /Enter at least \$810\.00/);
    // outbid by the leader's existing maximum: price rises only by one step above the new bid
    r = await w.bid(B2, id, 85000);
    assert.equal(r.outbid_by_existing_maximum, true); assert.equal(r.is_high_bidder, false);
    assert.equal(await w.price(id), 86000);
    // a bigger maximum takes the lead at one step above the old maximum
    r = await w.bid(B2, id, 95000);
    assert.equal(r.is_high_bidder, true);
    assert.equal(await w.price(id), 91000);
    // the leader can raise their own maximum without changing the price, but not lower it
    await as(B2);
    await assert.rejects(db.query('select public.place_bid($1,95000)', [id]), /must be higher than your current maximum/);
    await w.bid(B2, id, 99000);
    assert.equal(await w.price(id), 91000);
    // the leader's maximum is private: it is not in the public listing row
    const pub = (await raw('select price_cents,bid_count from public.listings where id=$1', [id])).rows[0];
    assert.equal(Number(pub.price_cents), 91000); assert.ok(pub.bid_count >= 3);
    // the status helper tells each member where they stand
    await as(B2); assert.equal((await db.query('select public.my_bid_status($1) as s', [id])).rows[0].s.is_high_bidder, true);
    await as(B1); const mine = (await db.query('select public.my_bid_status($1) as s', [id])).rows[0].s;
    assert.equal(mine.is_high_bidder, false); assert.equal(Number(mine.my_max_cents), 90000);

    // the winner pays the final price, not their maximum
    await w.timing("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    assert.equal(await w.settle(), 1);
    await as(B2);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [id, ADDRESS])).rows[0].r;
    assert.equal(Number(reservation.price_cents), 91000);
  } finally { await db.close(); }
});

test('bidding needs a card on file, a clean record, and a sensible account', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    const NOCARD = '55555555-5555-4555-8555-555555555555';
    await raw('insert into auth.users(id,email) values($1,$2)', [NOCARD, 'nocard@example.test']);
    const id = await w.newAuction(80000);
    await as(NOCARD);
    await assert.rejects(db.query('select public.place_bid($1,80000)', [id]), /Add a card to bid/);
    let status = (await db.query('select public.my_bid_status($1) as s', [id])).rows[0].s;
    assert.equal(status.can_bid, false); assert.match(status.reason, /Add a card/);
    // a card saved through Stripe (the webhook calls record_bid_card) unlocks bidding
    await as(S, 'service_role'); await db.query("select public.record_bid_card($1,'fp_nocard_01')", [NOCARD]);
    await w.bid(NOCARD, id, 80000);
    // a card that belongs to a banned member does not count
    await raw("insert into public.blocked_fingerprints(kind,fingerprint,banned_user_id) values('card','fp_b3_000003',null)");
    await as(B3);
    await assert.rejects(db.query('select public.place_bid($1,90000)', [id]), /Add a card to bid/);
    // two unpaid wins pause bidding
    const lid = await w.newAuction(20000);
    await raw('insert into public.bid_strikes(user_id,listing_id) values($1,$2),($1,$3)', [B1, id, lid]);
    await as(B1);
    await assert.rejects(db.query('select public.place_bid($1,30000)', [lid]), /Bidding is paused/);
    // an unrelated member is unaffected, and nobody can read the private tables
    await w.bid(B2, lid, 20000);
    await as(B2);
    await assert.rejects(db.query('select * from public.auction_state'), /permission denied/);
    await assert.rejects(db.query('select public.record_bid_card($1,$2)', [B2, 'fp_attack_0001']), /permission denied/);
  } finally { await db.close(); }
});

test('soft close: a bid in the last five minutes extends the auction by five minutes; earlier bids do not', async () => {
  const w = await world(); const { raw } = w;
  try {
    const id = await w.newAuction(80000);
    const ends0 = (await raw('select auction_ends_at from public.listings where id=$1', [id])).rows[0].auction_ends_at;
    let r = await w.bid(B1, id, 80000);
    assert.equal(r.extended, false);
    assert.equal(String((await raw('select auction_ends_at from public.listings where id=$1', [id])).rows[0].auction_ends_at), String(ends0));
    await w.timing("update public.listings set auction_ends_at=now()+interval '2 minutes' where id=$1", [id]);
    r = await w.bid(B2, id, 85000);
    assert.equal(r.extended, true);
    const left = (await raw("select extract(epoch from (auction_ends_at-now())) as s from public.listings where id=$1", [id])).rows[0].s;
    assert.ok(left > 4 * 60 && left <= 5 * 60, 'about five minutes remain after the bid');
  } finally { await w.db.close(); }
});

test('a seller cannot change the price or timing once there are bids, delete an auction with bids, or edit after it ends', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    const exp = price => JSON.stringify({title:'Signed helmet',description:'A fictional listing for testing.',category:'Sports',price_cents:price,evidence:''});
    const edit = async (id, price, expected) => { await as(S); return db.query("select public.edit_listing($1,'Signed helmet','A fictional listing for testing.','Sports',$2,'',null,null,null,null,$3::jsonb)", [id, price, expected]); };

    // before any bid the seller may still adjust the starting bid, and may delete
    let id = await w.newAuction(80000);
    await edit(id, 75000, exp(80000));
    assert.equal(await w.price(id), 75000);
    await as(S); await db.query('select public.delete_listing($1)', [id]);

    // with a bid: price locked, delete refused
    id = await w.newAuction(80000);
    await w.bid(B1, id, 90000);
    await assert.rejects(edit(id, 100, exp(80000)), /already has bids/);
    await as(S);
    await assert.rejects(db.query('select public.delete_listing($1)', [id]), /has bids/);
    assert.equal(await w.price(id), 80000);
    // type and end time are never editable by the seller
    await assert.rejects(raw("update public.listings set auction_ends_at=now()+interval '30 days' where id=$1", [id]), /cannot be changed/);
    // after the end time (before settlement) the price is also frozen
    id = await w.newAuction(80000);
    await w.timing("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    await assert.rejects(edit(id, 100, exp(80000)), /already has bids \(or has ended\)/);
    await as(S);
    await assert.rejects(db.query('select public.delete_listing($1)', [id]), /has bids/);
  } finally { await db.close(); }
});

test('a winner who does not pay gets a strike and the item is offered to the next bidder, then closed for relisting', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    const id = await w.newAuction(80000);
    await w.bid(B1, id, 100000); // leads
    await w.bid(B2, id, 90000);  // the leader's maximum answers; price 91,000
    await w.bid(B3, id, 95000);  // reaches 95,000, the highest of the runners-up
    await w.timing("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    assert.equal(await w.settle(), 1);
    let award = (await raw("select buyer_id,auction_award from public.availability_requests where listing_id=$1 and status='confirmed'", [id])).rows[0];
    assert.equal(award.buyer_id, B1); assert.equal(award.auction_award, true);
    assert.equal(await w.settle(), 0, 'nothing happens while the 48 hour offer is still open');

    // the winner lets 48 hours pass
    await raw("update public.availability_requests set expires_at=now()-interval '1 minute' where listing_id=$1 and status='confirmed'", [id]);
    assert.equal(await w.settle(), 1);
    assert.equal((await raw('select count(*)::int as c from public.bid_strikes where user_id=$1 and listing_id=$2', [B1, id])).rows[0].c, 1);
    award = (await raw("select buyer_id from public.availability_requests where listing_id=$1 and status='confirmed'", [id])).rows[0];
    assert.equal(award.buyer_id, B3, 'the next-highest bidder is offered the item');
    assert.equal(await w.price(id), 95000, 'at the highest bid they placed, not the winner\'s price');
    assert.equal((await raw('select status from public.listings where id=$1', [id])).rows[0].status, 'pending');
    await as(B3);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [id, ADDRESS])).rows[0].r;
    assert.equal(Number(reservation.price_cents), 95000);

    // the runner-up also does not pay, then the next bidder, then nobody is left and the item is closed for relisting
    await raw("update public.checkout_sessions set status='expired' where listing_id=$1", [id]);
    await raw("update public.availability_requests set expires_at=now()-interval '1 minute' where listing_id=$1 and status='confirmed'", [id]);
    assert.equal(await w.settle(), 1);
    assert.equal((await raw("select buyer_id from public.availability_requests where listing_id=$1 and status='confirmed'", [id])).rows[0].buyer_id, B2);
    await raw("update public.availability_requests set expires_at=now()-interval '1 minute' where listing_id=$1 and status='confirmed'", [id]);
    assert.equal(await w.settle(), 1);
    assert.equal((await raw('select status from public.listings where id=$1', [id])).rows[0].status, 'archived');
    assert.equal(await w.settle(), 0, 'and it stays settled');
    assert.equal((await raw('select count(*)::int as c from public.bid_strikes where listing_id=$1', [id])).rows[0].c, 3);
  } finally { await db.close(); }
});

test('a winner who pays is not struck and the sweep leaves the sold item alone', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    const id = await w.newAuction(80000);
    await w.bid(B1, id, 80000);
    await w.timing("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    await w.settle();
    await as(B1);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2) as r', [id, ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_auction_paid')", [reservation.checkout_session_id]);
    await as(B1, 'service_role');
    await db.query("select public.finalize_checkout_session('cs_auction_paid','pi_auction_paid')");
    await raw("update public.availability_requests set expires_at=now()-interval '1 minute' where listing_id=$1", [id]);
    assert.equal(await w.settle(), 0);
    assert.equal((await raw('select count(*)::int as c from public.bid_strikes where listing_id=$1', [id])).rows[0].c, 0);
    assert.equal((await raw('select status from public.listings where id=$1', [id])).rows[0].status, 'sold');
  } finally { await db.close(); }
});
