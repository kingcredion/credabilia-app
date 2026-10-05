import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610050100_purchase_emails_and_pickup_meetup.sql','202610050101_admin_alert_new_order.sql','202610050102_ship_pending_notification.sql','202610050103_buyer_chosen_shipping.sql','202610050104_seller_pays_shipping_charge.sql','202610050105_bug_reports.sql','202610050106_auction_hardening.sql','202610050110_locked_until_seller_can_be_paid.sql','202610050111_relist_switch_and_payout_nudges.sql'];

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
const S = '11111111-1111-4111-8111-111111111111', B1 = '22222222-2222-4222-8222-222222222222';
let n = 0;

// A seller who has saved a Stripe account but not finished setup (charges_enabled stays false).
async function world() {
  const ctx = await freshDb();
  const { db, as, raw } = ctx;
  for (const id of [S, B1]) await raw('insert into auth.users(id,email) values($1,$2)', [id, id.slice(0,4)+'@example.test']);
  await raw("insert into public.payment_fingerprints(user_id,kind,fingerprint) values($1,'card','fp_b1_000001')", [B1]);
  await raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
  await as(S);
  await db.query('select public.save_shipping_address($1)', [{...ADDRESS,name:'Sam Seller'}]);
  await db.query("select public.save_stripe_account('acct_test_seller')");
  ctx.timing = async (sql, params) => { await db.exec("select set_config('app.auction_internal','1',false)"); try { return await raw(sql, params); } finally { await db.exec("select set_config('app.auction_internal','',false)"); } };
  ctx.newListing = async (type, price = 80000) => {
    n++;
    const path = S + `/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa${String(n).padStart(4,'0')}.png`;
    await as(S);
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
    const extra = type === 'auction' ? ",p_listing_type=>'auction',p_auction_days=>5" : '';
    return (await db.query(`select public.create_listing_with_details('Signed helmet','A fictional listing for testing.','Sports',$1,'',null,null,null,$2,'{}','[]',40,12,12,12,false${extra}) as id`, [price, JSON.stringify([{path,kind:'item'}])])).rows[0].id;
  };
  ctx.unlock = async () => { await as(S, 'service_role'); await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)"); };
  ctx.events = async () => { const rows = (await raw("select body from net._http_calls where url like '%klaviyo%' order by id")).rows; await raw('delete from net._http_calls'); return rows.map(r => r.body.data.attributes.metric.data.attributes.name); };
  return ctx;
}


test('an auction that ends with no bids can be relisted by its seller as fixed price or auction; anything else cannot', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    await w.unlock();
    const id = await w.newListing('auction');
    await w.timing("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    await as(S, 'service_role'); await db.query('select public.settle_ended_auctions()');
    assert.equal((await raw('select status,archived_reason from public.listings where id=$1', [id])).rows[0].archived_reason, 'auction_no_bids');

    await as(S);
    const ended = (await db.query('select public.my_ended_listings() as l')).rows[0].l;
    assert.deepEqual(ended.map(l => [l.id, l.reason]), [[id, 'auction_no_bids']]);
    // someone else cannot relist it, and the price and type must make sense
    await as(B1);
    await assert.rejects(db.query("select public.relist_ended_listing($1,'fixed',90000)", [id]), /only relist your own/);
    await as(S);
    await assert.rejects(db.query("select public.relist_ended_listing($1,'fixed',50)", [id]), /between \$1 and \$1,000,000/);
    await assert.rejects(db.query("select public.relist_ended_listing($1,'auction',90000,4)", [id]), /3, 5, or 7 day/);
    await db.query("select public.relist_ended_listing($1,'fixed',90000)", [id]);
    let row = (await raw('select status,listing_type,price_cents,bid_count,archived_reason,auction_ends_at from public.listings where id=$1', [id])).rows[0];
    assert.deepEqual([row.status, row.listing_type, Number(row.price_cents), row.bid_count, row.archived_reason, row.auction_ends_at], ['active', 'fixed', 90000, 0, null, null]);
    assert.equal((await db.query('select public.my_ended_listings() as l')).rows[0].l.length, 0);
    await assert.rejects(db.query("select public.relist_ended_listing($1,'fixed',90000)", [id]), /cannot be relisted/);

    // a listing an operator removed (or the seller deleted) is not relistable
    const removed = await w.newListing('fixed', 5000);
    await raw("update public.listings set status='archived' where id=$1", [removed]);
    await as(S);
    await assert.rejects(db.query("select public.relist_ended_listing($1,'fixed',5000)", [removed]), /cannot be relisted/);
  } finally { await db.close(); }
});

test('relisting an auction whose winner did not pay starts a clean round: old bids are kept as history, not offered again', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    await w.unlock();
    const id = await w.newListing('auction');
    await as(B1); await db.query('select public.place_bid($1,80000)', [id]);
    await w.timing("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    await as(S, 'service_role'); await db.query('select public.settle_ended_auctions()');
    await raw("update public.availability_requests set expires_at=now()-interval '1 minute' where listing_id=$1", [id]);
    await as(S, 'service_role'); await db.query('select public.settle_ended_auctions()');
    assert.equal((await raw('select archived_reason from public.listings where id=$1', [id])).rows[0].archived_reason, 'auction_unpaid');
    await as(S);
    await db.query("select public.relist_ended_listing($1,'auction',80000,7)", [id]);
    assert.equal((await raw('select count(*)::int as c from public.bids where listing_id=$1', [id])).rows[0].c, 0);
    assert.equal((await raw('select count(*)::int as c from public.bids_archive where listing_id=$1', [id])).rows[0].c, 1, 'the old bid is kept');
    assert.equal((await raw('select auction_days from public.listings where id=$1', [id])).rows[0].auction_days, 7);
    await as(B1); // the earlier winner is struck once but may bid again: a new round, a first bid again
    const r = (await db.query('select public.place_bid($1,81000) as r', [id])).rows[0].r;
    assert.equal(Number(r.amount_cents), 80000);
  } finally { await db.close(); }
});

test('a live listing can be switched between fixed price and auction, but not once there are bids or a buyer is mid-purchase', async () => {
  const w = await world(); const { db, as, raw } = w;
  try {
    await w.unlock();
    const id = await w.newListing('fixed', 40000);
    await as(S);
    await assert.rejects(db.query("select public.change_listing_type($1,'fixed')", [id]), /already fixed price/);
    await assert.rejects(db.query("select public.change_listing_type($1,'auction',4)", [id]), /3, 5, or 7 day/);
    await as(B1);
    await assert.rejects(db.query("select public.change_listing_type($1,'auction',5)", [id]), /only change your own/);
    await as(S);
    await db.query("select public.change_listing_type($1,'auction',5)", [id]);
    let row = (await raw("select listing_type, price_cents, auction_days, extract(epoch from (auction_ends_at-now())) as left_s from public.listings where id=$1", [id])).rows[0];
    assert.deepEqual([row.listing_type, Number(row.price_cents), row.auction_days], ['auction', 40000, 5]);
    assert.ok(row.left_s > 4.9 * 86400);
    // with a bid, it cannot go back
    await as(B1); await db.query('select public.place_bid($1,40000)', [id]);
    await as(S);
    await assert.rejects(db.query("select public.change_listing_type($1,'fixed')", [id]), /already has bids/);

    // a fixed listing someone has asked to buy cannot be switched while that is open
    const other = await w.newListing('fixed', 5000);
    await as(B1); await db.query('select public.request_to_buy($1)', [other]);
    await as(S);
    await assert.rejects(db.query("select public.change_listing_type($1,'auction',3)", [other]), /in the middle of buying/);
    // and an auction with no bids can go back to fixed price
    const quiet = await w.newListing('auction', 20000);
    await db.query("select public.change_listing_type($1,'fixed')", [quiet]);
    row = (await raw('select listing_type, auction_ends_at, auction_days from public.listings where id=$1', [quiet])).rows[0];
    assert.deepEqual([row.listing_type, row.auction_ends_at, row.auction_days], ['fixed', null, null]);
  } finally { await db.close(); }
});

test('a seller who publishes before finishing Stripe gets one setup email event, then spaced reminders, and none once unlocked', async () => {
  const w = await world(); const { db, as, raw } = w;
  const nudges = async () => (await w.events()).filter(name => /^Payout Setup/.test(name));
  try {
    await nudges();
    await w.newListing('fixed', 5000);
    assert.deepEqual(await nudges(), ['Payout Setup Needed']);
    await w.newListing('fixed', 6000);
    assert.deepEqual(await nudges(), [], 'a second listing does not send a second welcome nudge');

    // nothing to remind about until the listings are a day old
    await as(S, 'service_role');
    assert.equal((await db.query('select public.send_payout_setup_reminders() as n')).rows[0].n, 0);
    await raw("update public.listings set created_at=now()-interval '25 hours' where seller_id=$1", [S]);
    await raw("update public.payout_setup_notices set last_sent_at=now()-interval '4 days'");
    await as(S, 'service_role');
    assert.equal((await db.query('select public.send_payout_setup_reminders() as n')).rows[0].n, 1);
    assert.deepEqual(await nudges(), ['Payout Setup Reminder']);
    assert.equal((await db.query('select public.send_payout_setup_reminders() as n')).rows[0].n, 0, 'not again within 3 days');
    // capped at 4 messages in total
    await raw("update public.payout_setup_notices set last_sent_at=now()-interval '4 days',sent_count=4");
    await as(S, 'service_run'.replace('run','role'));
    assert.equal((await db.query('select public.send_payout_setup_reminders() as n')).rows[0].n, 0);
    // once Stripe confirms the seller, no more reminders
    await raw("update public.payout_setup_notices set sent_count=1,last_sent_at=now()-interval '4 days'");
    await w.unlock();
    await as(S, 'service_role');
    assert.equal((await db.query('select public.send_payout_setup_reminders() as n')).rows[0].n, 0);
  } finally { await db.close(); }
});
