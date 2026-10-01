import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const OPERATOR = 'a9028fe8-c514-47bd-a873-ccd78251783a';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql'];

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

function fakePath(seller) { return seller + '/' + Math.random().toString(16).slice(2).padStart(12,'0').slice(0,12) + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'; }

async function publish(db, as, raw, seller, {needsReview, signaturePath} = {}) {
  await as(seller);
  const itemPath = fakePath(seller);
  await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
  const media = [{path:itemPath,kind:'item'}];
  if (signaturePath) { await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [signaturePath]); media.push({path:signaturePath,kind:'signature'}); }
  const id = (await db.query(
    "select public.create_listing_with_details('Fixture item','A fictional listing for testing.','Sports',2500,'',null,null,null,$1,'{}','[]',8,8,6,4,false,'fixed',null,null,null,false,null,$2,$3) as id",
    [JSON.stringify(media), needsReview||false, needsReview?'Looked unrelated to collectibles.':null]
  )).rows[0].id;
  return id;
}

test('browse_scored_listings(): credibility score only appears for listings with a signature photo', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id,email) values($1,$2)', [seller, 's@example.test']);
    const unsignedId = await publish(db, as, raw, seller, {});
    const signaturePath = fakePath(seller);
    const signedId = await publish(db, as, raw, seller, {signaturePath});
    const items = (await raw('select public.browse_scored_listings() as items')).rows[0].items;
    const unsigned = items.find(i => i.id === unsignedId), signed = items.find(i => i.id === signedId);
    assert.equal('credibility_score' in unsigned, false);
    assert.equal('certificate_score' in unsigned, false);
    assert.equal('certificate_supplied' in unsigned, false);
    assert.equal(typeof signed.credibility_score, 'number');
    assert.equal(typeof signed.certificate_score, 'number');
  } finally { await db.close(); }
});

test('needs_review listings are held from public browse but stay visible to their own seller', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', stranger = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', stranger, 'x@example.test']);
    const heldId = await publish(db, as, raw, seller, {needsReview:true});
    const activeId = await publish(db, as, raw, seller, {});

    await as(seller);
    let mine = (await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items;
    assert.ok(mine.some(i => i.id === heldId), 'the seller can see their own held listing');
    assert.equal(mine.find(i => i.id === heldId).status, 'needs_review');
    assert.equal(mine.find(i => i.id === heldId).needs_review_reason, 'Looked unrelated to collectibles.');

    await as(stranger);
    let theirs = (await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items;
    assert.ok(!theirs.some(i => i.id === heldId), 'a stranger never sees someone else\'s held listing');
    assert.ok(theirs.some(i => i.id === activeId), 'a stranger still sees the normal active listing');
  } finally { await db.close(); }
});

test('a held listing cannot be bought, and edit_listing can move it back to active or keep it held', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', buyer, 'b@example.test']);
    const heldId = await publish(db, as, raw, seller, {needsReview:true});

    await as(buyer);
    await assert.rejects(db.query('select public.request_to_buy($1)',[heldId]),/not available/);

    await as(seller);
    const expected = (await db.query('select title,description,category,price_cents,evidence from public.listings where id=$1',[heldId])).rows[0];
    await db.query("select public.edit_listing($1,$2,'A better description that explains the collectible context.','Sports',2500,'',null,null,null,null,$3,true,$4)",
      [heldId,expected.title,JSON.stringify(expected),'Still looks unrelated.']);
    let row = (await db.query('select status,needs_review_reason from public.listings where id=$1',[heldId])).rows[0];
    assert.equal(row.status,'needs_review');
    assert.equal(row.needs_review_reason,'Still looks unrelated.');

    const expected2 = (await db.query('select title,description,category,price_cents,evidence from public.listings where id=$1',[heldId])).rows[0];
    await db.query("select public.edit_listing($1,$2,$3,'Sports',2500,'',null,null,null,null,$4,false,null)",
      [heldId,expected2.title,expected2.description,JSON.stringify(expected2)]);
    row = (await db.query('select status,needs_review_reason from public.listings where id=$1',[heldId])).rows[0];
    assert.equal(row.status,'active');
    assert.equal(row.needs_review_reason,null);
  } finally { await db.close(); }
});

test('admin listing review: is_operator()-gated, approve clears the hold, reject archives it', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)', [seller, 's@example.test', OPERATOR, 'kingcredion@credabilia.com']);
    await raw('insert into public.operators(user_id) values($1)', [OPERATOR]);
    const heldId = await publish(db, as, raw, seller, {needsReview:true});
    const heldId2 = await publish(db, as, raw, seller, {needsReview:true});

    await as(seller);
    await assert.rejects(db.query('select public.admin_list_needs_review_listings()'), /Not authorized/);
    await assert.rejects(db.query('select public.admin_approve_listing($1)',[heldId]), /Not authorized/);

    await as(OPERATOR);
    const queue = (await db.query('select public.admin_list_needs_review_listings() as items')).rows[0].items;
    assert.equal(queue.length, 2);
    assert.ok(queue.every(i => i.needs_review_reason));

    await db.query('select public.admin_approve_listing($1)',[heldId]);
    let row = (await raw('select status,needs_review_reason from public.listings where id=$1',[heldId])).rows[0];
    assert.equal(row.status,'active');
    assert.equal(row.needs_review_reason,null);

    await as(OPERATOR);
    await db.query("select public.admin_reject_listing($1,'Not a collectible.')",[heldId2]);
    row = (await raw('select status,needs_review_reason from public.listings where id=$1',[heldId2])).rows[0];
    assert.equal(row.status,'archived');
    assert.equal(row.needs_review_reason,'Not a collectible.');

    await assert.rejects(db.query('select public.admin_approve_listing($1)',[heldId2]), /not found or not pending review/i);
  } finally { await db.close(); }
});
