import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('per-purchase messaging: participants only, validation, and message counts',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    await db.query("select public.update_profile('Sam Seller')");
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_media('Fictional messaging item','A fictional description for testing.','Sports',1500,'') as id")).rows[0].id;

    await as(buyer);
    await db.query("select public.update_profile('Blair Buyer')");
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_msg')",[reservation.checkout_session_id]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_msg','pi_test_msg') as id")).rows[0].id;

    // --- send_message validation ---
    await as(buyer);
    await assert.rejects(db.query("select public.send_message($1,'')",[purchaseId]),/between 1 and 2000/);
    await assert.rejects(db.query("select public.send_message($1,$2)",[purchaseId,'x'.repeat(2001)]),/between 1 and 2000/);

    // --- only the purchase's actual buyer or seller may send/read ---
    await as(other);
    await assert.rejects(db.query("select public.send_message($1,'Hello?')",[purchaseId]),/Purchase not found/);
    await assert.rejects(db.query('select public.get_messages($1)',[purchaseId]),/Purchase not found/);

    // --- happy path: buyer asks, seller replies ---
    await as(buyer);
    const first=(await db.query("select public.send_message($1,'  Does this ship internationally?  ') as m",[purchaseId])).rows[0].m;
    assert.equal(first.body,'Does this ship internationally?'); // trimmed
    assert.equal(first.sender_id,buyer);
    assert.equal(first.sender_name,'Blair Buyer');

    await as(seller);
    const second=(await db.query("select public.send_message($1,'Yes, happy to ship anywhere.') as m",[purchaseId])).rows[0].m;
    assert.equal(second.sender_name,'Sam Seller');

    // --- get_messages: right shape, ordering, sender_name joined ---
    await as(buyer);
    const thread=(await db.query('select public.get_messages($1) as t',[purchaseId])).rows[0].t;
    assert.equal(thread.length,2);
    assert.equal(thread[0].body,'Does this ship internationally?');
    assert.equal(thread[0].sender_name,'Blair Buyer');
    assert.equal(thread[1].body,'Yes, happy to ship anywhere.');
    assert.equal(thread[1].sender_name,'Sam Seller');

    // Seller sees the identical thread.
    await as(seller);
    const sellerThread=(await db.query('select public.get_messages($1) as t',[purchaseId])).rows[0].t;
    assert.equal(sellerThread.length,2);

    // --- my_sales()/my_purchases() surface an accurate message_count ---
    await as(seller);
    const sales=(await db.query('select public.my_sales() as s')).rows[0].s;
    assert.equal(sales.find(sale=>sale.id===purchaseId).message_count,2);

    await as(buyer);
    const purchases=(await db.query('select public.my_purchases() as p')).rows[0].p;
    assert.equal(purchases.find(p=>p.purchase_id===purchaseId).message_count,2);

    // --- authenticated-only: anon is rejected outright ---
    await as(other,'anon');
    await assert.rejects(db.query("select public.send_message($1,'x')",[purchaseId]),/permission denied/);
    await assert.rejects(db.query('select public.get_messages($1)',[purchaseId]),/permission denied/);
  } finally { await db.close(); }
});
