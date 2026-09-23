import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/retry-background-removal/handler.js';

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
  // Same migration list proven to build cleanly in tests/signatureCredibility.test.js, plus this
  // feature's own new migration appended at the end.
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(user, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

test('create_listing_with_media publishes with a .jpg main photo and flags it pending; a .png main photo is never flagged', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const jpgPath = seller + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const pngPath = seller + '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    for (const p of [jpgPath, pngPath]) await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [p]);
    const publish = path => db.query("select public.create_listing_with_media('Retry fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$1) as id", [JSON.stringify([{ path, kind: 'item' }])]);
    const jpgId = (await publish(jpgPath)).rows[0].id;
    const pngId = (await publish(pngPath)).rows[0].id;
    assert.ok(jpgId && pngId); // both publish without raising, unlike the old hard block
    const jpgRow = (await raw('select bg_pending,bg_attempts from public.listing_media where path=$1', [jpgPath])).rows[0];
    assert.equal(jpgRow.bg_pending, true);
    assert.equal(jpgRow.bg_attempts, 0);
    const pngRow = (await raw('select bg_pending from public.listing_media where path=$1', [pngPath])).rows[0];
    assert.equal(pngRow.bg_pending, false);
  } finally { await db.close(); }
});

test('edit_listing flags a re-submitted .jpg main photo as pending when photos are touched', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const initialPath = seller + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  const newPath = seller + '/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg';
  try {
    await raw('insert into auth.users(id) values($1)', [seller]);
    await as(seller);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [initialPath]);
    const id = (await db.query("select public.create_listing_with_media('Retry fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$1) as id", [JSON.stringify([{ path: initialPath, kind: 'item' }])])).rows[0].id;
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [newPath]);
    await db.query("select public.edit_listing($1,'Retry fixture','A fictional listing for testing.','Sports',3000,'',null,null,null,$2,$3)",
      [id, JSON.stringify([{ path: newPath, kind: 'item' }]), JSON.stringify({ title: 'Retry fixture', description: 'A fictional listing for testing.', category: 'Sports', price_cents: 3000, evidence: '' })]);
    const row = (await raw('select bg_pending from public.listing_media where path=$1', [newPath])).rows[0];
    assert.equal(row.bg_pending, true);
  } finally { await db.close(); }
});

function makeService({rows, downloadOk=true, uploadOk=true, updateOk=true}) {
  const updates=[], removed=[];
  const service={
    from(table){
      assert.equal(table,'listing_media');
      return {
        select:()=>({eq:()=>({eq:()=>({lt:()=>({limit:async()=>({data:rows,error:null})})})})}),
        update:fields=>({eq:async(col,val)=>{updates.push({...fields,_where:val});return {error: updateOk?null:new Error('update failed')};}}),
      };
    },
    storage:{from:()=>({
      download:async()=>downloadOk?{data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'}),error:null}:{data:null,error:new Error('missing')},
      upload:async()=>({error: uploadOk?null:new Error('upload failed')}),
      remove:async(paths)=>{removed.push(...paths);return {error:null};},
    })},
  };
  return {service,updates,removed};
}

test('retry-background-removal: a pending row is swapped to a new path and cleared on Photoroom success', async () => {
  const path='11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const {service,updates,removed}=makeService({rows:[{path,bg_attempts:1}]});
  let calls=0;
  const handler=createHandler({env:()=>'test-key',createClient:()=>service,
    fetcher:async url=>{calls++;assert.equal(url,'https://sdk.photoroom.com/v1/segment');return new Response(new Uint8Array([1,2,3]),{status:200});}});
  const result=await handler(new Request('https://example.test',{method:'POST'}));
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{processed:1,succeeded:1});
  assert.equal(calls,1);
  assert.equal(updates.length,1);
  assert.equal(updates[0].bg_pending,false);
  assert.equal(updates[0].bg_attempts,0);
  assert.match(updates[0].path,/\.png$/);
  assert.equal(updates[0]._where,path);
  assert.deepEqual(removed,[path]);
});

test('retry-background-removal: a Photoroom failure increments attempts and keeps retrying under the cap', async () => {
  const path='11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const {service,updates}=makeService({rows:[{path,bg_attempts:2}]});
  const handler=createHandler({env:()=>'test-key',createClient:()=>service,fetcher:async()=>new Response('nope',{status:502})});
  const result=await handler(new Request('https://example.test',{method:'POST'}));
  assert.deepEqual(await result.json(),{processed:1,succeeded:0});
  assert.equal(updates.length,1);
  assert.equal(updates[0].bg_attempts,3);
  assert.equal(updates[0].bg_pending,true);
});

test('retry-background-removal: hitting the 5-attempt cap stops retrying and keeps the original photo', async () => {
  const path='11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const {service,updates}=makeService({rows:[{path,bg_attempts:4}]});
  const handler=createHandler({env:()=>'test-key',createClient:()=>service,fetcher:async()=>new Response('nope',{status:502})});
  await handler(new Request('https://example.test',{method:'POST'}));
  assert.equal(updates[0].bg_attempts,5);
  assert.equal(updates[0].bg_pending,false);
});

test('retry-background-removal: does nothing when PHOTOROOM_API_KEY is not configured', async () => {
  const handler=createHandler({env:()=>null,createClient:()=>{throw new Error('should not be called');},fetcher:async()=>{throw new Error('should not be called');}});
  const result=await handler(new Request('https://example.test',{method:'POST'}));
  assert.deepEqual(await result.json(),{processed:0,succeeded:0});
});
