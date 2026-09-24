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
  // Same base list proven to build cleanly in tests/signatureCredibility.test.js, plus this
  // feature's own new migration appended at the end.
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(user, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

test('delete_listing: owner-only, active-only, sets status to archived and drops it from browse', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const stranger = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, stranger]);
    await as(seller);
    const id = (await db.query("select public.create_listing('Delete fixture','A fictional listing for testing.','Sports',1000,'') as id")).rows[0].id;

    await as(stranger);
    await assert.rejects(db.query('select public.delete_listing($1)', [id]), /own listing/);

    await as(seller);
    await db.query('select public.delete_listing($1)', [id]);
    const status = (await raw('select status from public.listings where id=$1', [id])).rows[0].status;
    assert.equal(status, 'archived');

    let browse = (await raw('select public.browse_listings_with_certificates() as items')).rows[0].items;
    assert.ok(!browse.some(item => item.id === id));

    // Already archived -- a second attempt is rejected, not silently a no-op.
    await assert.rejects(db.query('select public.delete_listing($1)', [id]), /Only active listings/);
  } finally { await db.close(); }
});

test('delete_listing: a listing mid-checkout (pending) cannot be deleted out from under a buyer', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const buyer = '22222222-2222-4222-8222-222222222222';
  try {
    await raw('insert into auth.users(id) values($1),($2)', [seller, buyer]);
    await as(seller);
    const id = (await db.query("select public.create_listing('Delete fixture','A fictional listing for testing.','Sports',1000,'') as id")).rows[0].id;

    await as(buyer);
    await db.query('select public.request_to_buy($1)', [id]);

    await as(seller);
    await assert.rejects(db.query('select public.delete_listing($1)', [id]), /Only active listings/);
    const status = (await raw('select status from public.listings where id=$1', [id])).rows[0].status;
    assert.equal(status, 'pending');
  } finally { await db.close(); }
});

test('delete_listing requires selling permission', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    const id = (await db.query("select public.create_listing('Delete fixture','A fictional listing for testing.','Sports',1000,'') as id")).rows[0].id;
    await raw('update public.account_permissions set can_sell=false where user_id=$1', [seller]);
    await assert.rejects(db.query('select public.delete_listing($1)', [id]), /Selling permission required/);
  } finally { await db.close(); }
});
