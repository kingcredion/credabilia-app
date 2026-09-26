import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

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
  const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300043_reports_and_blocks.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql'];
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

test('conversations: buyer-initiated, listing-scoped threads that pre-date any purchase',async()=>{
  const {db,as,raw}=await freshDb();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    otherBuyer='33333333-3333-4333-8333-333333333333',stranger='44444444-4444-4444-8444-444444444444';
  try{
    await db.query('insert into auth.users(id) values($1),($2),($3),($4)',[seller,buyer,otherBuyer,stranger]);

    await as(seller);
    await db.query("select public.update_profile('Sam Seller')");
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    // This suite loads the full migration chain (including 202609300030's background-removed-
    // main-photo requirement), so a real .png item photo is required -- mirrors
    // tests/pickupCheckout.test.js's confirmedListing() fixture pattern.
    const itemPath1=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.png';
    const itemPath2=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1),('listing-media',$2)",[itemPath1,itemPath2]);
    const listingId=(await db.query("select public.create_listing_with_media('Fictional messaging item','A fictional description for testing.','Sports',1500,'',null,null,null,$1) as id",[JSON.stringify([{path:itemPath1,kind:'item'}])])).rows[0].id;
    const secondListingId=(await db.query("select public.create_listing_with_media('Second fictional item','Another fictional description.','Sports',2500,'',null,null,null,$1) as id",[JSON.stringify([{path:itemPath2,kind:'item'}])])).rows[0].id;

    await as(buyer);
    await db.query("select public.update_profile('Blair Buyer')");
    await as(otherBuyer);
    await db.query("select public.update_profile('Casey Collector')");

    // --- a buyer can open a conversation before ever buying anything ---
    await as(buyer);
    const conv=(await db.query('select public.get_or_create_conversation($1) as c',[listingId])).rows[0].c;
    assert.equal(conv.listing_id,listingId);
    assert.equal(conv.listing_title,'Fictional messaging item');
    assert.equal(conv.listing_status,'active');

    // idempotent: a second click on the same listing returns the same conversation, not a duplicate
    const convAgain=(await db.query('select public.get_or_create_conversation($1) as c',[listingId])).rows[0].c;
    assert.equal(convAgain.id,conv.id);

    // can't message yourself
    await as(seller);
    await assert.rejects(db.query('select public.get_or_create_conversation($1)',[listingId]),/cannot message yourself/);

    // a different buyer messaging the same seller about the same listing gets a SEPARATE thread
    await as(otherBuyer);
    const otherConv=(await db.query('select public.get_or_create_conversation($1) as c',[listingId])).rows[0].c;
    assert.notEqual(otherConv.id,conv.id);

    // the same buyer messaging the same seller about a DIFFERENT listing gets a separate thread too
    await as(buyer);
    const secondConv=(await db.query('select public.get_or_create_conversation($1) as c',[secondListingId])).rows[0].c;
    assert.notEqual(secondConv.id,conv.id);

    // --- send_message validation ---
    await assert.rejects(db.query("select public.send_message($1,'')",[conv.id]),/between 1 and 2000/);
    await assert.rejects(db.query("select public.send_message($1,$2)",[conv.id,'x'.repeat(2001)]),/between 1 and 2000/);

    // --- only the conversation's actual buyer or seller may send/read ---
    await as(stranger);
    await db.query("select public.update_profile('Sam Stranger')");
    await assert.rejects(db.query("select public.send_message($1,'Hello?')",[conv.id]),/Conversation not found/);
    await assert.rejects(db.query('select public.get_messages($1)',[conv.id]),/Conversation not found/);

    // --- happy path: buyer asks, seller replies, all before any purchase exists ---
    await as(buyer);
    const first=(await db.query("select public.send_message($1,'  Does this ship internationally?  ') as m",[conv.id])).rows[0].m;
    assert.equal(first.body,'Does this ship internationally?'); // trimmed
    assert.equal(first.sender_id,buyer);
    assert.equal(first.sender_name,'Blair Buyer');

    await as(seller);
    const second=(await db.query("select public.send_message($1,'Yes, happy to ship anywhere.') as m",[conv.id])).rows[0].m;
    assert.equal(second.sender_name,'Sam Seller');

    // --- get_messages: right shape, ordering, sender_name joined, both sides see the same thread ---
    await as(buyer);
    const thread=(await db.query('select public.get_messages($1) as t',[conv.id])).rows[0].t;
    assert.equal(thread.length,2);
    assert.equal(thread[0].body,'Does this ship internationally?');
    assert.equal(thread[1].body,'Yes, happy to ship anywhere.');

    await as(seller);
    const sellerThread=(await db.query('select public.get_messages($1) as t',[conv.id])).rows[0].t;
    assert.equal(sellerThread.length,2);

    // --- list_conversations(): both sides see it, with counterparty/unread/last message ---
    const sellerInbox=(await db.query('select public.list_conversations() as c')).rows[0].c;
    const sellerRow=sellerInbox.find(row=>row.id===conv.id);
    assert.equal(sellerRow.role,'seller');
    assert.equal(sellerRow.counterparty_name,'Blair Buyer');
    assert.equal(sellerRow.last_message_body,'Yes, happy to ship anywhere.');
    assert.equal(sellerRow.unread,false); // seller just sent the last message themselves

    await as(buyer);
    const buyerInbox=(await db.query('select public.list_conversations() as c')).rows[0].c;
    const buyerRow=buyerInbox.find(row=>row.id===conv.id);
    assert.equal(buyerRow.role,'buyer');
    assert.equal(buyerRow.counterparty_name,'Sam Seller');
    assert.equal(buyerRow.unread,true); // seller's reply hasn't been read yet
    assert.equal(buyerInbox.length,2); // this buyer's two conversations (conv, secondConv), not otherConv

    // --- mark_messages_read clears the unread flag ---
    await db.query('select public.mark_messages_read($1)',[conv.id]);
    const buyerInboxAfterRead=(await db.query('select public.list_conversations() as c')).rows[0].c;
    assert.equal(buyerInboxAfterRead.find(row=>row.id===conv.id).unread,false);

    // --- authenticated-only: anon is rejected outright ---
    await as(stranger,'anon');
    await assert.rejects(db.query("select public.send_message($1,'x')",[conv.id]),/permission denied/);
    await assert.rejects(db.query('select public.get_messages($1)',[conv.id]),/permission denied/);
    await assert.rejects(db.query('select public.get_or_create_conversation($1)',[listingId]),/permission denied/);
    await assert.rejects(db.query('select public.list_conversations()'),/permission denied/);

    // --- a purchase later on the SAME listing/buyer continues the SAME conversation ---
    await as(buyer);
    const buyRequest=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[buyRequest.id]);
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_msg')",[reservation.checkout_session_id]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_msg','pi_test_msg') as id")).rows[0].id;

    await as(seller);
    const sales=(await db.query('select public.my_sales() as s')).rows[0].s;
    const sale=sales.find(s=>s.id===purchaseId);
    assert.equal(sale.conversation_id,conv.id); // same thread, not a fresh one
    assert.equal(sale.message_count,2); // the two pre-purchase messages still count

    await as(buyer);
    const purchases=(await db.query('select public.my_purchases() as p')).rows[0].p;
    const purchase=purchases.find(p=>p.purchase_id===purchaseId);
    assert.equal(purchase.conversation_id,conv.id);
    assert.equal(purchase.message_count,2);
  } finally { await db.close(); }
});

test('clear_conversation: drops a thread from the caller\'s own inbox until new activity arrives',async()=>{
  const {db,as,raw}=await freshDb();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222';
  try{
    await db.query('insert into auth.users(id) values($1),($2)',[seller,buyer]);
    await as(seller);
    await db.query("select public.update_profile('Sam Seller')");
    const itemPath=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.png';
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[itemPath]);
    const listingId=(await db.query("select public.create_listing_with_media('Fictional clear-test item','A fictional description.','Sports',1200,'',null,null,null,$1) as id",[JSON.stringify([{path:itemPath,kind:'item'}])])).rows[0].id;

    await as(buyer);
    await db.query("select public.update_profile('Blair Buyer')");
    const conv=(await db.query('select public.get_or_create_conversation($1) as c',[listingId])).rows[0].c;
    await db.query("select public.send_message($1,'Still available?')",[conv.id]);

    // buyer clears it -- disappears from the buyer's own inbox, but the seller still sees it
    await db.query('select public.clear_conversation($1)',[conv.id]);
    const buyerInbox=(await db.query('select public.list_conversations() as c')).rows[0].c;
    assert.ok(!buyerInbox.some(row=>row.id===conv.id));

    await as(seller);
    const sellerInbox=(await db.query('select public.list_conversations() as c')).rows[0].c;
    assert.ok(sellerInbox.some(row=>row.id===conv.id));

    // a fresh message from the seller un-clears it for the buyer automatically
    await db.query("select public.send_message($1,'Yes, still here!')",[conv.id]);
    await as(buyer);
    const buyerInboxAfterReply=(await db.query('select public.list_conversations() as c')).rows[0].c;
    assert.ok(buyerInboxAfterReply.some(row=>row.id===conv.id));

    // clearing is ownership-scoped
    const stranger='33333333-3333-4333-8333-333333333333';
    await raw('insert into auth.users(id) values($1)',[stranger]);
    await as(stranger);
    await db.query("select public.update_profile('Sam Stranger')");
    await assert.rejects(db.query('select public.clear_conversation($1)',[conv.id]),/Conversation not found/);
  } finally { await db.close(); }
});
