import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040091_signature_reference_images.sql','202610040092_signature_reference_one_per_photo.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610050100_purchase_emails_and_pickup_meetup.sql','202610050101_admin_alert_new_order.sql','202610050102_ship_pending_notification.sql','202610050103_buyer_chosen_shipping.sql','202610050104_seller_pays_shipping_charge.sql','202610050105_bug_reports.sql','202610050106_auction_hardening.sql','202610050110_locked_until_seller_can_be_paid.sql','202610050126_edit_signature_subject.sql','202610060129_signature_profiles.sql','202610060130_signer_required_and_merge_suggestions.sql'];

async function freshDb(upTo = MIGRATIONS.length) {
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
  for (const file of MIGRATIONS.slice(0, upTo)) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};
const S = '11111111-1111-4111-8111-111111111111', B1 = '22222222-2222-4222-8222-222222222222';
let n = 0;

// A seller who has saved a Stripe account but not finished setup (charges_enabled stays false).
async function world(upTo) {
  const ctx = await freshDb(upTo);
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

const OP = '44444444-4444-4444-8444-444444444444';

const sigMedia = (listing, path, position = 1) => ["insert into public.listing_media(listing_id,path,kind,position) values($1,$2,'signature',$3)", [listing, path, position]];

test('a signature photo cannot be saved without a signed-by name, however the listing is written', async () => {
  const w = await world(); const { db, raw, as } = w;
  try {
    const path = S + '/dddddddd-dddd-4ddd-8ddd-dddddddd0001.jpg';
    const itemPath = S + '/dddddddd-dddd-4ddd-8ddd-dddddddd0002.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1),('listing-media',$2)", [path, itemPath]);
    const media = JSON.stringify([{ path: itemPath, kind: 'item' }, { path, kind: 'signature' }]);
    const create = attrs => (db.query("select public.create_listing_with_details('Signed ball','A fictional listing.','Sports',5000,'',null,null,null,$1,$2,'[]',40,12,12,12,false) as id", [media, attrs]));

    await as(S);
    await assert.rejects(create('{}'), /Enter who signed it/);
    await assert.rejects(create('{"subject":"   "}'), /Enter who signed it/, 'spaces are not a name');
    const id = (await create('{"subject":"Mike Tyson"}')).rows[0].id;
    assert.equal((await raw("select attributes->>'subject' as s from public.listings where id=$1", [id])).rows[0].s, 'Mike Tyson');

    // removing the name from a listing that has a signature photo is refused too (the editing path)
    await assert.rejects(raw("update public.listings set attributes=attributes-'subject' where id=$1", [id]), /Enter who signed it/);
    assert.equal((await raw("select attributes->>'subject' as s from public.listings where id=$1", [id])).rows[0].s, 'Mike Tyson', 'nothing changed');

    // a listing with no signature photo needs no name
    await as(S);
    const itemOnly = JSON.stringify([{ path: S + '/dddddddd-dddd-4ddd-8ddd-dddddddd0003.png', kind: 'item' }]);
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [S + '/dddddddd-dddd-4ddd-8ddd-dddddddd0003.png']);
    await as(S);
    await db.query("select public.create_listing_with_details('Plain item','A fictional listing.','Sports',5000,'',null,null,null,$1,'{}','[]',40,12,12,12,false)", [itemOnly]);
  } finally { await w.db.close(); }
});

test('an older signed listing with no name keeps working until someone edits it, and then the edit needs a name', async () => {
  const w = await world(); const { db, raw } = w;
  try {
    // simulate the old state: a signature photo registered before the rule (no name), inserted with the check switched off
    const id = await w.newListing('fixed', 5000);
    const path = S + '/dddddddd-dddd-4ddd-8ddd-dddddddd0010.jpg';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
    await raw('alter table public.listing_media disable trigger signed_listing_needs_signer_media');
    await raw(...sigMedia(id, path));
    await raw('alter table public.listing_media enable trigger signed_listing_needs_signer_media');
    // unrelated activity that does not rewrite the details is fine
    await raw("update public.listings set price_cents=6000 where id=$1", [id]);
    // an edit that rewrites the details without a name is not
    await assert.rejects(raw("update public.listings set attributes='{}'::jsonb where id=$1", [id]), /Enter who signed it/);
    await raw("update public.listings set attributes=jsonb_build_object('subject','Pete Rose') where id=$1", [id]);
  } finally { await w.db.close(); }
});

test('suggested merges find the same person under another spelling, and never mix Jr with Sr or unrelated people', async () => {
  const w = await world(); const { raw } = w;
  try {
    const match = async (a, b) => (await raw('select public.signature_names_may_match(public.normalize_person_name($1), public.normalize_person_name($2)) as m', [a, b])).rows[0].m;
    assert.equal(await match('Mike Tyson', 'Michael Tyson'), true, 'nickname');
    assert.equal(await match('Pete Rose', 'Peter Edward Rose'), true, 'short form inside a longer name');
    assert.equal(await match('Michael Jordan', 'Michael B. Jordan'), true, 'middle initial added');
    assert.equal(await match('Shaq', "Shaquille O'Neal"), true, 'a one-word name that is part of the longer one');
    assert.equal(await match('Bob Gibson', 'Robert Gibson'), true);
    assert.equal(await match('Ken Griffey', 'Ken Griffey Jr'), true, 'with and without the suffix is worth a look');
    assert.equal(await match('Ken Griffey Jr', 'Ken Griffey Sr'), false, 'Jr and Sr are different people');
    assert.equal(await match('Ken Griffey Jr', 'Kevin Garnett Jr'), false);
    assert.equal(await match('Mike Tyson', 'Michael Vick'), false, 'a shared first name is not enough');
    assert.equal(await match('James Jones', 'John Jones'), false, 'same surname, different first names');
    assert.equal(await match('Mike Tyson', 'Mike Tyson'), false, 'a profile is never suggested to merge with itself');
    assert.equal(await match('', 'Mike Tyson'), false);
  } finally { await w.db.close(); }
});

test('the profiles list carries merge suggestions, and merging a suggested pair works end to end', async () => {
  const w = await world(); const { db, raw, as } = w;
  try {
    await raw('insert into auth.users(id,email) values($1,$2)', [OP, 'op@example.test']);
    await raw('insert into public.operators(user_id) values($1)', [OP]);
    await as(OP);
    const ids = {};
    for (const name of ['Mike Tyson', 'Michael Tyson', 'Pete Rose', 'Ken Griffey Jr', 'Ken Griffey Sr']) ids[name] = (await raw('select public.ensure_signature_subject($1,$2) as id', [name, OP])).rows[0].id;
    await as(OP);
    const list = (await db.query('select public.admin_list_signature_subjects() as r')).rows[0].r;
    const sugg = name => list.find(p => p.name === name).merge_suggestions.map(s => s.name);
    assert.deepEqual(sugg('Mike Tyson'), ['Michael Tyson']);
    assert.deepEqual(sugg('Michael Tyson'), ['Mike Tyson']);
    assert.deepEqual(sugg('Pete Rose'), []);
    assert.deepEqual(sugg('Ken Griffey Jr'), [], 'Jr is not offered Sr');
    assert.equal(list.find(p => p.name === 'Mike Tyson').merge_suggestions[0].signatures, 0);

    await db.query('select public.admin_merge_signature_subjects($1,$2)', [ids['Michael Tyson'], ids['Mike Tyson']]);
    const after = (await db.query('select public.admin_list_signature_subjects() as r')).rows[0].r;
    assert.deepEqual(after.find(p => p.name === 'Mike Tyson').merge_suggestions, [], 'once merged the suggestion is gone');
    assert.deepEqual(after.find(p => p.name === 'Mike Tyson').aliases, ['Michael Tyson']);
    await as(B1);
    await assert.rejects(db.query('select public.admin_list_signature_subjects()'), /Not authorized/);
  } finally { await w.db.close(); }
});
