import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040091_signature_reference_images.sql','202610040092_signature_reference_one_per_photo.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610050100_purchase_emails_and_pickup_meetup.sql','202610050101_admin_alert_new_order.sql','202610050102_ship_pending_notification.sql','202610050103_buyer_chosen_shipping.sql','202610050104_seller_pays_shipping_charge.sql','202610050105_bug_reports.sql','202610050106_auction_hardening.sql','202610050110_locked_until_seller_can_be_paid.sql','202610050126_edit_signature_subject.sql','202610060129_signature_profiles.sql'];

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

// Registers a signature photo on a new listing and, when a name is given, captures it to the library like publishing does.
async function library(w) {
  const { raw } = w;
  await raw('insert into auth.users(id,email) values($1,$2)', [OP, 'op@example.test']);
  await raw('insert into public.operators(user_id) values($1)', [OP]);
  let k = 0;
  return async (typed, note = 'Strokes look natural.') => {
    k++;
    const listing = await w.newListing('fixed', 5000);
    const path = S + '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb' + String(k).padStart(4, '0') + '.jpg';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
    await raw("insert into public.listing_media(listing_id,path,kind,position) values($1,$2,'signature',1)", [listing, path]);
    await raw('select public.capture_signature_reference($1,$2,$3)', [listing, typed, note]);
    const ref = (await raw('select id from public.signature_references where media_path=$1', [path])).rows[0]?.id;
    return { listing, path, ref };
  };
}
const refRow = async (raw, id) => (await raw('select subject_name, submitted_name, provenance, subject_id from public.signature_references where id=$1', [id])).rows[0];

test('names are tidied to one key: case, spacing, punctuation and accents never split a person, but Jr and Sr stay different people', async () => {
  const w = await world(); const { raw } = w;
  try {
    const key = async name => (await raw('select public.normalize_person_name($1) as k', [name])).rows[0].k;
    assert.equal(await key('Mike Tyson'), 'mike tyson');
    assert.equal(await key('  MIKE   tyson. '), 'mike tyson');
    assert.equal(await key("Shaquille O'Neal"), await key('Shaquille ONeal'));
    assert.equal(await key('José Canseco'), await key('Jose Canseco'));
    assert.equal(await key('Ken Griffey-Jr.'), 'ken griffey jr');
    assert.notEqual(await key('Ken Griffey Jr'), await key('Ken Griffey Sr'));
    assert.equal(await key('   '), null);
    assert.equal(await key('!!!'), null);
  } finally { await w.db.close(); }
});

test('a new signature files itself under the profile for that person, however the name was typed, and a stranger waits unlinked', async () => {
  const w = await world(); const { db, raw, as } = w;
  try {
    const add = await library(w);
    const first = await add('Mike Tyson');
    assert.equal((await refRow(raw, first.ref)).subject_id, null, 'no profile exists yet');
    await as(OP);
    const promoted = (await db.query('select public.admin_promote_signature_reference($1) as r', [first.ref])).rows[0].r;
    assert.equal(promoted.subject_name, 'Mike Tyson'); assert.equal(promoted.provenance, 'operator_curated');
    assert.equal((await raw('select count(*)::int as n from public.signature_subjects')).rows[0].n, 1, 'approving made the profile');

    for (const typed of ['mike tyson', '  MIKE   TYSON. ']) {
      const again = await add(typed);
      const row = await refRow(raw, again.ref);
      assert.equal(row.subject_id, promoted.subject_id, typed + ' joins the same profile');
      assert.equal(row.subject_name, 'Mike Tyson', "filed under the profile's proper name");
      assert.equal(row.submitted_name, typed.trim().replace(/\s+/g, ' '), 'what the seller typed is kept');
      assert.equal(row.provenance, 'self_reported', 'matching is not approval');
    }
    const stranger = await add('Michael Tyson');
    assert.equal((await refRow(raw, stranger.ref)).subject_id, null, 'a different spelling waits for a person to decide');
    assert.equal((await raw('select count(*)::int as n from public.signature_subjects')).rows[0].n, 1, 'no profile was invented for it');
  } finally { await w.db.close(); }
});

test('the admin queue suggests the closest profile; approving into it remembers the spelling so the next one files itself', async () => {
  const w = await world(); const { db, raw, as } = w;
  try {
    const add = await library(w);
    const a = await add('Mike Tyson'); await as(OP);
    await db.query('select public.admin_promote_signature_reference($1)', [a.ref]);
    const b = await add('Michael Tyson'); await as(OP);
    const queue = (await db.query("select public.admin_list_signature_references('self_reported') as r")).rows[0].r;
    const entry = queue.find(x => x.id === b.ref);
    assert.equal(entry.subject_id, null);
    assert.deepEqual(entry.suggestions.map(s => s.name), ['Mike Tyson'], 'same surname is suggested');
    assert.equal(entry.submitted_name, 'Michael Tyson');

    const profile = (await raw('select id from public.signature_subjects')).rows[0].id;
    await as(OP);
    await db.query('select public.admin_promote_signature_reference($1,null,$2,false)', [b.ref, profile]);
    const row = await refRow(raw, b.ref);
    assert.deepEqual([row.subject_name, row.subject_id, row.provenance], ['Mike Tyson', profile, 'operator_curated']);
    assert.deepEqual((await raw('select aliases from public.signature_subjects where id=$1', [profile])).rows[0].aliases, ['Michael Tyson'], 'the spelling was learned');

    const c = await add('michael  tyson');
    assert.equal((await refRow(raw, c.ref)).subject_id, profile, 'the next Michael Tyson files itself');
  } finally { await w.db.close(); }
});

test('only an operator can approve, move, rename or merge; members and signed-out visitors cannot, and sellers can only search profile names', async () => {
  const w = await world(); const { db, as } = w;
  try {
    const add = await library(w);
    const a = await add('Pete Rose'); await as(OP);
    const profile = (await db.query('select public.admin_promote_signature_reference($1) as r', [a.ref])).rows[0].r.subject_id;
    await as(B1);
    for (const [sql, params] of [
      ['select public.admin_promote_signature_reference($1)', [a.ref]],
      ['select public.admin_assign_signature_reference($1,$2)', [a.ref, profile]],
      ['select public.admin_list_signature_subjects()', []],
      ["select public.admin_rename_signature_subject($1,'X')", [profile]],
      ['select public.admin_merge_signature_subjects($1,$1)', [profile]],
      ["select public.admin_remove_signature_alias($1,'x')", [profile]],
    ]) await assert.rejects(db.query(sql, params), /Not authorized/);
    assert.deepEqual((await db.query("select public.search_signature_subjects('pete') as r")).rows[0].r, ['Pete Rose'], 'a seller sees names only');
    assert.deepEqual((await db.query("select public.search_signature_subjects('p') as r")).rows[0].r, [], 'one letter returns nothing');
    await assert.rejects(db.query('select * from public.signature_subjects'), /permission denied/);
    await assert.rejects(db.query("select public.resolve_signature_subject('Pete Rose')"), /permission denied/);
    await db.exec('reset role'); await db.exec('set role anon');
    await assert.rejects(db.query("select public.search_signature_subjects('pete')"), /permission denied/);
  } finally { await w.db.close(); }
});

test('merging two profiles moves every signature and keeps both names working; renaming cannot collide', async () => {
  const w = await world(); const { db, raw, as } = w;
  try {
    const add = await library(w);
    const a = await add('Mike Tyson'); await as(OP);
    const idA = (await db.query('select public.admin_promote_signature_reference($1) as r', [a.ref])).rows[0].r.subject_id;
    const b = await add('Iron Mike'); await as(OP);
    const idB = (await db.query('select public.admin_promote_signature_reference($1) as r', [b.ref])).rows[0].r.subject_id;
    assert.notEqual(idA, idB);
    await assert.rejects(db.query("select public.admin_rename_signature_subject($1,'  mike TYSON ')", [idB]), /Another profile already uses that name/);
    await assert.rejects(db.query('select public.admin_merge_signature_subjects($1,$1)', [idA]), /two different profiles/);
    const merged = (await db.query('select public.admin_merge_signature_subjects($1,$2) as r', [idB, idA])).rows[0].r;
    assert.equal(merged.moved, 1);
    assert.equal((await raw('select count(*)::int as n from public.signature_subjects')).rows[0].n, 1);
    assert.equal((await refRow(raw, b.ref)).subject_name, 'Mike Tyson');
    assert.deepEqual((await raw('select aliases from public.signature_subjects where id=$1', [idA])).rows[0].aliases, ['Iron Mike'], 'the old name now files here');
    const c = await add('iron mike');
    assert.equal((await refRow(raw, c.ref)).subject_id, idA, 'and a new Iron Mike lands in the merged profile');
    await as(OP);
    await db.query("select public.admin_rename_signature_subject($1,'Michael Gerard Tyson')", [idA]);
    assert.equal((await refRow(raw, a.ref)).subject_name, 'Michael Gerard Tyson', 'renaming a profile renames its signatures');
    await db.query("select public.admin_remove_signature_alias($1,'Iron Mike')", [idA]);
    assert.deepEqual((await raw('select aliases from public.signature_subjects where id=$1', [idA])).rows[0].aliases, []);
  } finally { await w.db.close(); }
});

test('the AI comparison finds a signer through the profile (aliases included), shows certificate-backed photos first, and names the profile', async () => {
  const w = await world(); const { db, raw, as } = w;
  try {
    const add = await library(w);
    for (let i = 0; i < 3; i++) { const r = await add('Mike Tyson'); await as(OP); await db.query('select public.admin_promote_signature_reference($1,null,null,false)', [r.ref]); }
    const strong = await add('Mike Tyson'); await as(OP);
    await db.query('select public.admin_promote_signature_reference($1,null,null,true)', [strong.ref]);
    const pending = await add('Mike Tyson'); // never approved: must not count
    const alias = await add('Michael Tyson'); await as(OP);
    const profile = (await raw('select subject_id from public.signature_references where id=$1', [strong.ref])).rows[0].subject_id;
    await db.query('select public.admin_promote_signature_reference($1,null,$2,false)', [alias.ref, profile]);
    await raw("update public.signature_references set created_at=now()-interval '1 day' where id=$1", [strong.ref]);

    await as(S, 'service_role');
    const viaAlias = (await db.query("select public.signature_reference_images('michael tyson', null, 3) as r")).rows[0].r;
    assert.equal(viaAlias.name, 'Mike Tyson', 'reported under the profile name');
    assert.equal(viaAlias.total, 5, 'the three plain, the certificate-backed one and the alias one; the unapproved one is left out');
    assert.equal(viaAlias.paths[0], strong.path, 'certificate-backed first even though it is the oldest');
    assert.ok(!viaAlias.paths.includes(pending.path));
    const excluded = (await db.query('select public.signature_reference_images($1, $2, 3) as r', ['Mike Tyson', strong.listing])).rows[0].r;
    assert.equal(excluded.total, 4, 'a listing is never compared with itself');
    const nobody = (await db.query("select public.signature_reference_images('Nobody Yet') as r")).rows[0].r;
    assert.deepEqual([nobody.total, nobody.name, nobody.paths], [0, null, []]);
    await as(B1);
    await assert.rejects(db.query("select public.signature_reference_images('Mike Tyson')"), /permission denied/);
  } finally { await w.db.close(); }
});

test('the existing library is turned into profiles by the migration, and a changed name sends a signature back to unverified', async () => {
  // The world as it was before this migration, with rows in the old shape; then the migration is applied over them.
  const w = await world(MIGRATIONS.length - 1); const { db, raw } = w;
  try {
    let k = 0;
    const listings = [];
    for (const [name, tier] of [['Mike Tyson', 'operator_curated'], ['mike tyson', 'operator_curated'], ['Mike Tyson', 'self_reported'], ['Pete Rose', 'operator_curated']]) {
      k++;
      const listing = await w.newListing('fixed', 5000); listings.push(listing);
      const path = S + '/cccccccc-cccc-4ccc-8ccc-cccccccc' + String(k).padStart(4, '0') + '.jpg';
      await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
      await raw("insert into public.listing_media(listing_id,path,kind,position) values($1,$2,'signature',1)", [listing, path]);
      await raw("insert into public.signature_references(subject_name,media_path,source_listing_id,provenance,description) values($1,$2,$3,$4,'x')", [name, path, listing, tier]);
    }
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../supabase/migrations/202610060129_signature_profiles.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await raw('select name from public.signature_subjects order by name')).rows.map(r => r.name), ['Mike Tyson', 'Pete Rose'], 'one profile per person');
    const rows = (await raw('select subject_name, submitted_name, provenance, subject_id is not null as linked from public.signature_references order by media_path')).rows;
    assert.deepEqual(rows.map(r => [r.subject_name, r.submitted_name, r.provenance, r.linked]), [
      ['Mike Tyson', 'Mike Tyson', 'operator_curated', true], ['Mike Tyson', 'mike tyson', 'operator_curated', true],
      ['Mike Tyson', 'Mike Tyson', 'self_reported', true], ['Pete Rose', 'Pete Rose', 'operator_curated', true]], 'approved stays approved, spellings kept');

    // the first photo is re-captured under another person's name: no longer approved as the old one
    await raw("select public.capture_signature_reference($1,'Pete Rose','still natural')", [listings[0]]);
    const moved = (await raw("select subject_name, provenance from public.signature_references where media_path like '%0001.jpg'")).rows[0];
    assert.deepEqual(moved, { subject_name: 'Pete Rose', provenance: 'self_reported' });
  } finally { await w.db.close(); }
});
