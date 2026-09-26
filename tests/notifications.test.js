import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('my_notifications(): refund/return/message states surface to the right party and self-clear',async()=>{
  const db=new PGlite({extensions:{vector}});
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    other='33333333-3333-4333-8333-333333333333';
  try{
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
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300043_reports_and_blocks.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}
    async function notifications(){return (await db.query('select public.my_notifications() as n')).rows[0].n;}

    await as(seller);
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    let photoCounter=0;
    async function makePurchase(stripeSessionId,paymentIntentId){
      await as(seller);
      // Full migration chain includes 202609300030's background-removed-main-photo requirement,
      // so a real .png item photo is required (mirrors tests/pickupCheckout.test.js's fixture).
      photoCounter++;
      const itemPath=seller+`/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa${String(photoCounter).padStart(4,'0')}.png`;
      await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[itemPath]);
      const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,$1,'{}','[]',8,8,6,4,false) as id",[JSON.stringify([{path:itemPath,kind:'item'}])])).rows[0].id;
      await as(buyer);
      const request=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
      await as(seller);
      await db.query('select public.respond_to_buy_request($1,true)',[request.id]);
      await as(buyer);
      const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
      await db.query("select public.attach_stripe_checkout_session($1,$2,$3,$4)",[reservation.checkout_session_id,stripeSessionId,0,0]);
      await as(buyer,'service_role');
      return (await db.query("select public.finalize_checkout_session($1,$2) as id",[stripeSessionId,paymentIntentId])).rows[0].id;
    }

    // === refund_pending: seller only, clears once they respond ===
    const purchase1=await makePurchase('cs_test_notif1','pi_test_notif1');
    await as(buyer);
    const req1=(await db.query("select public.request_refund($1,'Item arrived damaged.') as r",[purchase1])).rows[0].r;
    // Scoped to refund_pending, not a blanket empty-array check: the buyer legitimately still has
    // a lingering buy_request_confirmed notification from makePurchase()'s own availability-request
    // handshake, which never explicitly clears after checkout completes.
    assert.equal((await notifications()).filter(x=>x.kind==='refund_pending').length,0); // buyer never gets notified about their own request
    await as(seller);
    let n=await notifications();
    assert.equal(n.length,1);
    assert.equal(n[0].kind,'refund_pending');
    assert.equal(n[0].role,'seller');
    assert.equal(n[0].purchase_id,purchase1);
    await db.query("select public.offer_partial_refund($1,$2)",[req1.id,1500]);
    assert.deepEqual(await notifications(),[]); // cleared -- seller already acted

    // === partial_offered: buyer only ===
    await as(buyer);
    n=await notifications();
    const partialOffered=n.find(x=>x.kind==='partial_offered');
    assert.ok(partialOffered);
    assert.equal(partialOffered.role,'buyer');
    await db.query('select public.respond_to_partial_offer($1,false)',[req1.id]); // decline -> contested, not actionable by either party in-app
    assert.equal((await notifications()).filter(x=>x.kind==='partial_offered').length,0);
    await as(seller);
    assert.deepEqual(await notifications(),[]); // contested is deliberately not surfaced

    // === return_required: buyer only, clears once shipped ===
    const purchase2=await makePurchase('cs_test_notif2','pi_test_notif2');
    await as(buyer);
    const req2=(await db.query("select public.request_refund($1,'Wrong item.') as r",[purchase2])).rows[0].r;
    await as(seller);
    await db.query("select public.require_return($1)",[req2.id]);
    await as(buyer);
    n=await notifications();
    assert.equal(n.filter(x=>x.kind==='return_required').length,1);
    await db.query("select public.record_return_shipment($1,'sh_1','TRACK1','https://track/1','https://label/1')",[req2.id]);
    assert.equal((await notifications()).filter(x=>x.kind==='return_required').length,0);

    // === message: whichever party didn't send it, clears via mark_messages_read ===
    // Messaging is conversation-scoped now, not purchase-scoped -- finalize_checkout_session()
    // already created (or reused) a conversation for this listing+buyer, so look it up.
    const purchase3=await makePurchase('cs_test_notif3','pi_test_notif3');
    const conv3=(await raw('select conversation_id from public.purchases where id=$1',[purchase3])).rows[0].conversation_id;
    await as(buyer);
    await db.query("select public.send_message($1,'Hi, quick question.')",[conv3]);
    assert.equal((await notifications()).filter(x=>x.kind==='message').length,0); // not notified about your own message
    await as(seller);
    n=await notifications();
    const messageNotif=n.find(x=>x.kind==='message' && x.conversation_id===conv3);
    assert.ok(messageNotif);
    assert.equal(messageNotif.role,'seller');
    assert.equal(messageNotif.purchase_id,null); // message rows carry conversation_id, not purchase_id
    await db.query('select public.mark_messages_read($1)',[conv3]);
    assert.equal((await notifications()).filter(x=>x.kind==='message').length,0);

    // mark_messages_read is ownership-scoped
    await as(other);
    await assert.rejects(db.query('select public.mark_messages_read($1)',[conv3]),/not found/);

    // reply from seller notifies the buyer
    await as(seller);
    await db.query("select public.send_message($1,'Sure, ask away.')",[conv3]);
    await as(buyer);
    n=await notifications();
    const reply=n.find(x=>x.kind==='message' && x.conversation_id===conv3);
    assert.ok(reply);
    assert.equal(reply.role,'buyer');
  } finally { await db.close(); }
});
