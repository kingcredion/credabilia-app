import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('escrow holds funds until release, and insurance is buyer-paid and capped at $10,000',async()=>{
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
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    const insuredListing=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    const highValueListing=(await db.query("select public.create_listing_with_details('High value fictional item','A fictional description for testing.','Art',2000000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;

    // --- reserve_listing_checkout defaults to wanting insurance, and returns it ---
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[insuredListing,ADDRESS])).rows[0].r;
    assert.equal(reservation.want_insurance,true);
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_insured',$2,$3)",[reservation.checkout_session_id,895,55]); // shipping + marked-up insurance premium
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_insured','pi_test_insured') as id")).rows[0].id;
    const p=(await raw('select escrow_status,funds_released_at,insured,insured_value_cents,insurance_cost_cents,platform_fee_cents,seller_payout_cents,shipping_cost_cents from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(p.escrow_status,'held'); // not released at checkout -- unlike the old instant-payout flow
    assert.equal(p.funds_released_at,null);
    assert.equal(p.insured,true);
    assert.equal(p.insured_value_cents,5000);
    assert.equal(p.insurance_cost_cents,55);
    assert.equal(p.seller_payout_cents,5000-p.platform_fee_cents); // insurance never touches seller payout, only shipping does

    // --- declining insurance at reserve time results in an uninsured purchase ---
    await as(seller);
    const uninsuredListing=(await db.query("select public.create_listing_with_details('Second fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await as(buyer);
    const reservation2=(await db.query('select public.reserve_listing_checkout($1,$2,$3,$4) as r',[uninsuredListing,ADDRESS,0,false])).rows[0].r;
    assert.equal(reservation2.want_insurance,false);
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_uninsured',$2,$3)",[reservation2.checkout_session_id,895,0]);
    await as(buyer,'service_role');
    const purchaseId2=(await db.query("select public.finalize_checkout_session('cs_test_uninsured','pi_test_uninsured') as id")).rows[0].id;
    const p2=(await raw('select insured,insured_value_cents,insurance_cost_cents from public.purchases where id=$1',[purchaseId2])).rows[0];
    assert.equal(p2.insured,false);
    assert.equal(p2.insured_value_cents,0);
    assert.equal(p2.insurance_cost_cents,0);

    // --- insured value is capped at $10,000 even for a pricier item ---
    await as(buyer);
    const reservation3=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[highValueListing,ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_highvalue',$2,$3)",[reservation3.checkout_session_id,895,999]);
    await as(buyer,'service_role');
    const purchaseId3=(await db.query("select public.finalize_checkout_session('cs_test_highvalue','pi_test_highvalue') as id")).rows[0].id;
    const p3=(await raw('select insured_value_cents from public.purchases where id=$1',[purchaseId3])).rows[0];
    assert.equal(p3.insured_value_cents,1000000); // capped at $10,000, not the item's real $20,000 price

    // --- mark_purchase_released: service_role only, and only while still held ---
    await as(buyer);
    await assert.rejects(db.query("select public.mark_purchase_released($1,'tr_test_1')",[purchaseId]),/permission denied/);
    await as(other,'anon');
    await assert.rejects(db.query("select public.mark_purchase_released($1,'tr_test_1')",[purchaseId]),/permission denied/);
    await raw("select public.mark_purchase_released($1,'tr_test_1')",[purchaseId]);
    const released=(await raw('select escrow_status,stripe_transfer_id,funds_released_at from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(released.escrow_status,'released');
    assert.equal(released.stripe_transfer_id,'tr_test_1');
    assert.ok(released.funds_released_at);
    await assert.rejects(raw("select public.mark_purchase_released($1,'tr_test_2')",[purchaseId]),/already released/);

    // --- my_sales()/my_purchases() surface escrow status ---
    await as(seller);
    const sale=(await db.query('select public.my_sales() as s')).rows[0].s.find(x=>x.id===purchaseId);
    assert.equal(sale.escrow_status,'released');
    await as(buyer);
    const purchase=(await db.query('select public.my_purchases() as p')).rows[0].p.find(x=>x.purchase_id===purchaseId);
    assert.equal(purchase.escrow_status,'released');
    assert.equal(purchase.insured,true);
  } finally { await db.close(); }
});
