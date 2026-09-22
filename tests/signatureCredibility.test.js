import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

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
  // Same migration list already proven to build cleanly in tests/adminTrustSafety.test.js, plus
  // 202609110006/150007 (edit_listing/create_listing_with_details are introduced there) and this
  // feature's own 3 new migrations appended at the end.
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(user, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

test('signature kind is accepted and capped at 1 in create_listing_with_media', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const itemPath = seller + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  const sigPath = seller + '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg';
  const sigPath2 = seller + '/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    for (const p of [itemPath, sigPath, sigPath2]) await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [p]);
    const publish = assets => db.query("select public.create_listing_with_media('Signature fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$1) as id", [JSON.stringify(assets)]);
    // Two signature photos in one listing is rejected.
    await assert.rejects(publish([{ path: itemPath, kind: 'item' }, { path: sigPath, kind: 'signature' }, { path: sigPath2, kind: 'signature' }]), /Too many photos/);
    const id = (await publish([{ path: itemPath, kind: 'item' }, { path: sigPath, kind: 'signature' }])).rows[0].id;
    const kinds = (await raw('select kind from public.listing_media where listing_id=$1 order by position', [id])).rows.map(r => r.kind);
    assert.deepEqual(kinds, ['item', 'signature']);
  } finally { await db.close(); }
});

test('edit_listing stores the AI signature opinion, and the check constraint rejects an unrecognized label', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const itemPath = seller + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
    const id = (await db.query("select public.create_listing_with_media('Signature fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$1) as id", [JSON.stringify([{ path: itemPath, kind: 'item' }])])).rows[0].id;

    await db.query("select public.edit_listing($1,'Signature fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,null,$2,'consistent','Looks like natural pen pressure.')",
      [id, JSON.stringify({ title: 'Signature fixture', description: 'A fictional listing for testing.', category: 'Sports', price_cents: 3000, evidence: '' })]);
    const stored = (await raw('select signature_ai_label,signature_ai_note from public.listings where id=$1', [id])).rows[0];
    assert.equal(stored.signature_ai_label, 'consistent');
    assert.equal(stored.signature_ai_note, 'Looks like natural pen pressure.');

    await assert.rejects(raw("update public.listings set signature_ai_label='definitely real' where id=$1", [id]), /violates check constraint/);
  } finally { await db.close(); }
});

test('consume_signature_analysis(): 5/hour limit, requires selling permission', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    for (let i = 0; i < 5; i++) await db.query('select public.consume_signature_analysis()');
    await assert.rejects(db.query('select public.consume_signature_analysis()'), /signature analysis limit/);
    await assert.rejects(db.query('delete from public.signature_analysis_usage'), /permission denied/);
  } finally { await db.close(); }
});

test('browse_scored_listings(): the AI signature opinion shifts the certificate score by the documented, capped amount', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  let n = 0;
  async function publish() {
    n++;
    const path = seller + `/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa000${n}.png`;
    await as(seller);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
    return (await db.query("select public.create_listing_with_media('Signature fixture','A fictional listing for testing.','Sports',3000,'','psa','00001234',null,$1) as id", [JSON.stringify([{ path, kind: 'item' }])])).rows[0].id;
  }
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);

    // Baseline: no signature submitted -- score must be byte-identical to the pre-existing formula
    // (psa rating 95, weight 80/20, no audits -> community_score 50): round((95*80+50*20)/100)=86,
    // same value media.test.js already asserts for this exact fixture shape.
    const id1 = await publish();
    let items = (await raw('select public.browse_listings_with_certificates() as items')).rows[0].items;
    assert.equal(items.find(i => i.id === id1).credibility_score, 86);

    const id2 = await publish();
    await raw("update public.listings set signature_ai_label='consistent' where id=$1", [id2]);
    items = (await raw('select public.browse_listings_with_certificates() as items')).rows[0].items;
    // certificate_score capped at 95+5=100 -> round((100*80+50*20)/100)=90.
    assert.equal(items.find(i => i.id === id2).credibility_score, 90);

    const id3 = await publish();
    await raw("update public.listings set signature_ai_label='concerns' where id=$1", [id3]);
    items = (await raw('select public.browse_listings_with_certificates() as items')).rows[0].items;
    // certificate_score 95-15=80 -> round((80*80+50*20)/100)=74.
    assert.equal(items.find(i => i.id === id3).credibility_score, 74);
  } finally { await db.close(); }
});
