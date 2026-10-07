import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610060132_public_reviews.sql','202610070133_app_review_account.sql'];

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


const REVIEW='appreview@credabilia.com';
const U={review:'00000000-0000-0000-0000-0000000000a1',other:'00000000-0000-0000-0000-0000000000b2'};

async function world() {
  const t=await freshDb();
  await t.raw("insert into auth.users(id,email) values($1,$2),($3,$4)",[U.review,REVIEW,U.other,'seller@example.com']);
  return t;
}
async function insertListing(t,seller,status='active') {
  const {rows}=await t.raw("insert into public.listings(seller_id,title,description,category,price_cents,status) values($1,'Signed test item','A signed memorabilia item used only to test the review account rules.','Sports',1000,$2) returning id,status,needs_review_reason",[seller,status]);
  return rows[0];
}

test('the switch ships OFF and is a single locked row nobody can read from the app',async()=>{
  const t=await world();
  const {rows}=await t.raw('select enabled,email from public.app_review_access');
  assert.equal(rows.length,1); assert.equal(rows[0].enabled,false); assert.equal(rows[0].email,REVIEW);
  await t.as(U.other);
  await assert.rejects(()=>t.db.query('select * from public.app_review_access'),/permission denied/);
  await assert.rejects(()=>t.db.query('select public.is_app_review_account($1)',[U.review]),/permission denied/);
});

test('listings from the review account never go live to buyers, other sellers are unaffected',async()=>{
  const t=await world();
  const mine=await insertListing(t,U.review);
  assert.equal(mine.status,'needs_review'); assert.match(mine.needs_review_reason,/never shown to buyers/);
  const draftThenPublish=await insertListing(t,U.review,'draft');
  assert.equal(draftThenPublish.status,'draft');
  await t.raw("update public.listings set status='active' where id=$1",[draftThenPublish.id]);
  assert.equal((await t.raw('select status from public.listings where id=$1',[draftThenPublish.id])).rows[0].status,'needs_review');
  const theirs=await insertListing(t,U.other);
  assert.equal(theirs.status,'active');
});

test('the review account cannot start a checkout, bid or send a buy request',async()=>{
  const t=await world();
  const item=await insertListing(t,U.other);
  await assert.rejects(()=>t.raw("insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at) values($1,$2,$3,1000,now()+interval '1 hour')",[item.id,U.review,U.other]),/cannot buy, bid or send buy requests/);
  await assert.rejects(()=>t.raw("insert into public.bids(listing_id,bidder_id,amount_cents) values($1,$2,2000)",[item.id,U.review]),/cannot buy, bid or send buy requests/);
  await assert.rejects(()=>t.raw("insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 hour')",[item.id,U.review,U.other]),/cannot buy, bid or send buy requests/);
  // an ordinary buyer is not blocked
  await t.raw("insert into public.bids(listing_id,bidder_id,amount_cents) values($1,$2,2000)",[item.id,U.other]);
});

import {createHandler} from '../supabase/functions/review-sign-in/handler.js';
function fakeSupabase({row,linkError=null,hash='hash-123',verification='magiclink'}={}) {
  const calls={links:[]};
  return {calls,createClient:()=>({
    from:()=>({select:()=>({maybeSingle:async()=>({data:row,error:null})})}),
    auth:{admin:{generateLink:async args=>{calls.links.push(args);return linkError?{data:null,error:linkError}:{data:{properties:{hashed_token:hash,verification_type:verification}},error:null};}}},
  })};
}
const call=(handler,body)=>handler(new Request('https://x.test',{method:'POST',body:JSON.stringify(body)}));
const env=name=>({SUPABASE_URL:'https://x',SUPABASE_SERVICE_ROLE_KEY:'k'}[name]);

test('review sign-in hands out a token only when the switch is on and the address matches',async()=>{
  const on=fakeSupabase({row:{enabled:true,email:REVIEW}});
  const handler=createHandler({createClient:on.createClient,env});
  const ok=await (await call(handler,{email:'  AppReview@Credabilia.com '})).json();
  assert.deepEqual(ok,{enabled:true,token_hash:'hash-123',type:'magiclink'});
  assert.equal(on.calls.links[0].email,REVIEW);
  const other=await (await call(handler,{email:'someone@example.com'})).json();
  assert.deepEqual(other,{enabled:false}); assert.equal(on.calls.links.length,1);
});

test('review sign-in does nothing while the switch is off, and fails closed on errors',async()=>{
  const off=fakeSupabase({row:{enabled:false,email:REVIEW}});
  assert.deepEqual(await (await call(createHandler({createClient:off.createClient,env}),{email:REVIEW})).json(),{enabled:false});
  assert.equal(off.calls.links.length,0);
  const broken=fakeSupabase({row:{enabled:true,email:REVIEW},linkError:{message:'boom'}});
  const res=await call(createHandler({createClient:broken.createClient,env}),{email:REVIEW});
  assert.equal(res.status,503); assert.equal((await res.json()).token_hash,undefined);
  assert.equal((await createHandler({createClient:off.createClient,env})(new Request('https://x.test',{method:'GET'}))).status,405);
});

test('the probe only reports whether the switch is on, for anyone',async()=>{
  const on=createHandler({createClient:fakeSupabase({row:{enabled:true,email:REVIEW}}).createClient,env});
  const off=createHandler({createClient:fakeSupabase({row:{enabled:false,email:REVIEW}}).createClient,env});
  assert.deepEqual(await (await call(on,{probe:true})).json(),{enabled:true});
  assert.deepEqual(await (await call(off,{probe:true})).json(),{enabled:false});
  const spy=fakeSupabase({row:{enabled:true,email:REVIEW}});
  await call(createHandler({createClient:spy.createClient,env}),{probe:true});
  assert.equal(spy.calls.links.length,0); // a probe never mints a session
});
