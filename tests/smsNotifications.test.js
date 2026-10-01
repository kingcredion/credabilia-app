import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {createHandler} from '../supabase/functions/send-sms/handler.js';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

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
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

test('update_sms_preferences: sign-in required, validates phone on opt-in, opt-out clears the flag without erasing the number',async()=>{
  const {db,as,raw}=await freshDb();
  const user='11111111-1111-4111-8111-111111111111';
  try{
    await db.query('insert into auth.users(id) values($1)',[user]);
    await as('','anon');
    await assert.rejects(db.query("select public.update_sms_preferences('5555551234',true)"),/permission denied/);

    await as(user);
    await db.query("select public.update_profile('Sam Seller')");
    await assert.rejects(db.query("select public.update_sms_preferences('not-a-phone',true)"),/valid phone number/);
    await db.query("select public.update_sms_preferences('+15555551234',true)");
    let row=(await raw('select phone_number,sms_opt_in,sms_opt_in_at from public.profiles where id=$1',[user])).rows[0];
    assert.equal(row.phone_number,'+15555551234');
    assert.equal(row.sms_opt_in,true);
    assert.ok(row.sms_opt_in_at);

    // opting out just flips the flag -- the number stays on file so re-opting-in doesn't require retyping it
    await db.query("select public.update_sms_preferences(null,false)");
    row=(await raw('select phone_number,sms_opt_in from public.profiles where id=$1',[user])).rows[0];
    assert.equal(row.phone_number,'+15555551234');
    assert.equal(row.sms_opt_in,false);
  } finally { await db.close(); }
});

test('notify_sms fires through pg_net only for opted-in users, and never breaks the caller when it has nothing to send',async()=>{
  const {db,as,raw}=await freshDb();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222';
  try{
    await db.query('insert into auth.users(id) values($1),($2)',[seller,buyer]);
    await as(seller);
    await db.query("select public.update_profile('Sam Seller')");
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    await as(buyer);
    await db.query("select public.update_profile('Blair Buyer')");
    await db.query("select public.update_sms_preferences('+15555559999',true)");

    await as(seller);
    const itemPath=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[itemPath]);
    const listingId=(await db.query("select public.create_listing_with_media('Fictional sms item','A fictional description for testing.','Sports',2500,'',null,null,null,$1) as id",[JSON.stringify([{path:itemPath,kind:'item'}])])).rows[0].id;

    // buyer (opted in) requests to buy -> seller (not opted in) gets nothing, no error either way
    await as(buyer);
    await db.query('select public.request_to_buy($1)',[listingId]);
    let calls=(await raw("select * from net._http_calls where url like '%send-sms%'")).rows;
    assert.equal(calls.length,0); // seller never opted in

    // seller opts in, confirms the request -> buyer (opted in) gets a real pg_net call
    await as(seller);
    await db.query("select public.update_sms_preferences('+15555550000',true)");
    const request=(await raw("select id from public.availability_requests where listing_id=$1",[listingId])).rows[0];
    await db.query('select public.respond_to_buy_request($1,true)',[request.id]);
    calls=(await raw("select * from net._http_calls where url like '%send-sms%'")).rows;
    assert.equal(calls.length,1);
    assert.match(calls[0].body.body,/is still available/);
    assert.equal(calls[0].headers['x-sms-secret']?.length>0,true);
  } finally { await db.close(); }
});

test('place_bid: outbid notification fires for the previous high bidder (push + sms), never for the bidder themselves',async()=>{
  const {db,as,raw}=await freshDb();
  const seller='11111111-1111-4111-8111-111111111111',bidder1='22222222-2222-4222-8222-222222222222',bidder2='33333333-3333-4333-8333-333333333333';
  try{
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,bidder1,bidder2]);
    await as(bidder1);
    await db.query("select public.update_profile('Bidder One')");
    await db.query("select public.update_sms_preferences('+15555551111',true)");
    await as(bidder2);
    await db.query("select public.update_profile('Bidder Two')");

    await as(seller);
    await db.query("select public.update_profile('Sam Seller')");
    const itemPath=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[itemPath]);
    const listingId=(await db.query(
      "select public.create_listing_with_details('Fictional auction item','A fictional description for testing.','Sports',5000,'',null,null,null,$1,'{}','[]',8,8,6,4,false,'auction',3) as id",
      [JSON.stringify([{path:itemPath,kind:'item'}])]
    )).rows[0].id;

    await as(bidder1);
    await db.query('select public.place_bid($1,$2)',[listingId,5000]); // first bid -- no previous bidder, no notification
    let calls=(await raw("select * from net._http_calls where url like '%send-sms%'")).rows;
    assert.equal(calls.length,0);

    await as(bidder2);
    await db.query('select public.place_bid($1,$2)',[listingId,5100]); // outbids bidder1, who is opted in
    calls=(await raw("select * from net._http_calls where url like '%send-sms%'")).rows;
    assert.equal(calls.length,1);
    assert.match(calls[0].body.body,/outbid/);

    // bidder1 re-takes the lead -- bidder2 never opted in, so still zero additional calls
    await as(bidder1);
    await db.query('select public.place_bid($1,$2)',[listingId,5200]);
    calls=(await raw("select * from net._http_calls where url like '%send-sms%'")).rows;
    assert.equal(calls.length,1); // unchanged
  } finally { await db.close(); }
});

test('settle_ended_auctions still settles correctly with the sms/klaviyo additions, winner notified by sms when opted in',async()=>{
  const {db,as,raw}=await freshDb();
  const seller='11111111-1111-4111-8111-111111111111',winner='22222222-2222-4222-8222-222222222222';
  try{
    await db.query('insert into auth.users(id) values($1),($2)',[seller,winner]);
    await as(winner);
    await db.query("select public.update_profile('Winning Bidder')");
    await db.query("select public.update_sms_preferences('+15555552222',true)");
    await as(seller);
    await db.query("select public.update_profile('Sam Seller')");
    const itemPath=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[itemPath]);
    const listingId=(await db.query(
      "select public.create_listing_with_details('Fictional settle item','A fictional description for testing.','Sports',4000,'',null,null,null,$1,'{}','[]',8,8,6,4,false,'auction',3) as id",
      [JSON.stringify([{path:itemPath,kind:'item'}])]
    )).rows[0].id;
    await as(winner);
    await db.query('select public.place_bid($1,$2)',[listingId,4000]);
    await raw("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1",[listingId]);
    await as(seller,'service_role');
    const settled=(await db.query('select public.settle_ended_auctions() as n')).rows[0].n;
    assert.equal(settled,1);
    assert.equal((await raw('select status from public.listings where id=$1',[listingId])).rows[0].status,'pending');
    const calls=(await raw("select * from net._http_calls where url like '%send-sms%'")).rows;
    assert.ok(calls.some(c=>/You won/.test(c.body.body)));
  } finally { await db.close(); }
});

test('send-sms handler validates the shared secret and Twilio config, skips non-opted-in users, and sends otherwise',async()=>{
  const secret='test-sms-secret';
  const sent=[];
  async function sendSms(args) { sent.push(args); }
  function createClient() {
    return {
      from:table=>{
        if(table!=='profiles') throw new Error('unexpected table '+table);
        return {select:()=>({eq:()=>({maybeSingle:()=>Promise.resolve({data:{phone_number:'+15555550000',sms_opt_in:true},error:null})})})};
      },
    };
  }
  const env=key=>({SMS_TRIGGER_SECRET:secret,TWILIO_ACCOUNT_SID:'AC123',TWILIO_AUTH_TOKEN:'tok',TWILIO_FROM_NUMBER:'+18667500255',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'service'}[key]);
  const handler=createHandler({createClient,env,sendSms});
  const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{'x-sms-secret':secret,...headers},body:JSON.stringify(body)});

  assert.equal((await handler(request({user_id:'u1',body:'hi'},{'x-sms-secret':'wrong'}))).status,401);

  const noConfigEnv=key=>({SMS_TRIGGER_SECRET:secret}[key]);
  assert.equal((await createHandler({createClient,env:noConfigEnv,sendSms})(request({user_id:'u1',body:'hi'}))).status,503);

  const result=await handler(request({user_id:'u1',body:'You won "Fictional item"!'}));
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{sent:1});
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'+15555550000');
  assert.equal(sent[0].body,'You won "Fictional item"!');

  // not opted in -> skipped, no Twilio call
  function createClientOptedOut() {
    return {from:()=>({select:()=>({eq:()=>({maybeSingle:()=>Promise.resolve({data:{phone_number:null,sms_opt_in:false},error:null})})})})};
  }
  const skipped=await createHandler({createClient:createClientOptedOut,env,sendSms})(request({user_id:'u2',body:'hi'}));
  assert.deepEqual(await skipped.json(),{sent:0});
  assert.equal(sent.length,1); // unchanged
});
