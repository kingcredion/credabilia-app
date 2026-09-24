import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

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
  // Same base list proven to build cleanly in tests/signatureCredibility.test.js, plus
  // 202609300040 (is_operator, needed by the new admin RPCs), 202609300049 (the latest
  // create_listing_with_media/edit_listing bodies this migration's create_listing_with_details
  // builds on) and this feature's own new migration appended at the end.
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(user, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

function fakeVector(seed) {
  return '['+Array.from({length:1536},(_,i)=>((i+seed)%7)/7).join(',')+']';
}

async function publishSignedListing({ db, raw }, seller, { subject, note, withSignaturePhoto=true }) {
  const itemPath = seller + '/' + crypto.randomUUID() + '.png';
  const sigPath = withSignaturePhoto ? seller + '/' + crypto.randomUUID() + '.jpg' : null;
  await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [itemPath]);
  if (sigPath) await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [sigPath]);
  const media = [{ path: itemPath, kind: 'item' }, ...(sigPath ? [{ path: sigPath, kind: 'signature' }] : [])];
  const attributes = subject ? { subject } : {};
  const { rows } = await db.query(
    `select public.create_listing_with_details('Reference fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$1,$2,'[]',12,6,4,2,false,'fixed',null,'consistent',$3) as id`,
    [JSON.stringify(media), JSON.stringify(attributes), note]
  );
  return rows[0].id;
}

test('capture_signature_reference fires only when both a signature photo and a subject are present', async () => {
  const ctx = await freshDb();
  const { db, as, raw } = ctx;
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);

    // Both present -> captured.
    await publishSignedListing(ctx, seller, { subject: 'Michael Jordan', note: 'Natural pen pressure and flow.' });
    let rows = (await raw("select subject_name,provenance,description from public.signature_references where subject_name='Michael Jordan'")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provenance, 'self_reported');
    assert.equal(rows[0].description, 'Natural pen pressure and flow.');

    // No subject -> nothing captured.
    await publishSignedListing(ctx, seller, { subject: '', note: 'Looks fine.' });
    // Signature photo but no subject given some other listing -> still nothing new for that case.
    rows = (await raw("select count(*)::int as n from public.signature_references")).rows;
    assert.equal(rows[0].n, 1);

    // Subject given but no signature photo at all -> nothing captured.
    await publishSignedListing(ctx, seller, { subject: 'Kobe Bryant', note: 'n/a', withSignaturePhoto: false });
    rows = (await raw("select count(*)::int as n from public.signature_references")).rows;
    assert.equal(rows[0].n, 1);
  } finally { await db.close(); }
});

test('admin promote/discard require is_operator(), and only a promoted row is visible to search', async () => {
  const ctx = await freshDb();
  const { db, as, raw } = ctx;
  const seller = '11111111-1111-4111-8111-111111111111';
  const operator = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, operator]);
    await raw('insert into public.operators(user_id) values($1)', [operator]);

    await as(seller);
    await publishSignedListing(ctx, seller, { subject: 'Michael Jordan', note: 'Natural pen pressure and flow.' });
    const refId = (await raw("select id from public.signature_references where subject_name='Michael Jordan'")).rows[0].id;

    // Non-operator (the seller) can't list/promote/discard.
    await as(seller);
    await assert.rejects(db.query('select public.admin_list_signature_references()'), /Not authorized/);
    await assert.rejects(db.query('select public.admin_promote_signature_reference($1)', [refId]), /Not authorized/);
    await assert.rejects(db.query('select public.admin_discard_signature_reference($1)', [refId]), /Not authorized/);

    // Operator can list the self_reported candidate.
    await as(operator);
    let list = (await db.query("select public.admin_list_signature_references('self_reported') as list")).rows[0].list;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, refId);

    // Before promotion + embedding, search finds nothing (wrong provenance). set_signature_embedding
    // is service_role-only (called only by the cron job), so simulate the cron via raw() (bypasses
    // the authenticated role entirely) rather than calling it as the operator's own session.
    await raw('select public.set_signature_embedding($1,$2)', [refId, fakeVector(1)]);
    await as(operator);
    let matches = (await db.query('select public.search_signature_references($1,$2,5) as m', ['Michael Jordan', fakeVector(1)])).rows[0].m;
    assert.equal(matches.length, 0);

    // Promote -> now visible to search.
    await db.query('select public.admin_promote_signature_reference($1)', [refId]);
    matches = (await db.query('select public.search_signature_references($1,$2,5) as m', ['Michael Jordan', fakeVector(1)])).rows[0].m;
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, refId);
    assert.equal(matches[0].similarity, 1);

    // Discard removes it entirely.
    await db.query('select public.admin_discard_signature_reference($1)', [refId]);
    matches = (await db.query('select public.search_signature_references($1,$2,5) as m', ['Michael Jordan', fakeVector(1)])).rows[0].m;
    assert.equal(matches.length, 0);
  } finally { await db.close(); }
});

test('list_pending_signature_embeddings / set_signature_embedding: only rows without an embedding are returned, and setting one removes it from the queue', async () => {
  const ctx = await freshDb();
  const { db, as, raw } = ctx;
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    await publishSignedListing(ctx, seller, { subject: 'Michael Jordan', note: 'Natural pen pressure and flow.' });
    const refId = (await raw("select id from public.signature_references where subject_name='Michael Jordan'")).rows[0].id;

    let pending = (await raw('select public.list_pending_signature_embeddings(25) as p')).rows[0].p;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, refId);

    await raw('select public.set_signature_embedding($1,$2)', [refId, fakeVector(2)]);
    pending = (await raw('select public.list_pending_signature_embeddings(25) as p')).rows[0].p;
    assert.equal(pending.length, 0);
  } finally { await db.close(); }
});
