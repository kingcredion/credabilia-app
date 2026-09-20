import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('shipping addresses, checkout snapshot, sales/tracking, and permission boundaries',async()=>{
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
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_media('Fictional shippable item','A fictional description for testing.','Sports',2500,'') as id")).rows[0].id;

    // --- save_shipping_address validation ---
    await as(buyer);
    await assert.rejects(db.query('select public.save_shipping_address($1)',[{...ADDRESS,name:''}]),/required address fields/);
    await assert.rejects(db.query('select public.save_shipping_address($1)',[{}]),/required address fields/);
    await db.query('select public.save_shipping_address($1)',[ADDRESS]);
    assert.deepEqual((await raw('select shipping_address from public.profiles where id=$1',[buyer])).rows[0].shipping_address,ADDRESS);

    // --- reserve_listing_checkout now requires a valid shipping address ---
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2)',[listingId,{}]),/required address fields/);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    assert.equal((await raw('select shipping_address from public.checkout_sessions where id=$1',[reservation.checkout_session_id])).rows[0].shipping_address.zip,'62704');
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_ship')",[reservation.checkout_session_id]);

    // --- finalize_checkout_session snapshots the order's address onto the purchase ---
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_ship','pi_test_ship') as id")).rows[0].id;
    const purchaseRow=(await raw('select shipping_address,tracking_status from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.deepEqual(purchaseRow.shipping_address,ADDRESS);
    assert.equal(purchaseRow.tracking_status,'UNKNOWN');

    // --- record_shipment: only that sale's own seller may record a shipment ---
    await as(other);
    await assert.rejects(db.query('select public.record_shipment($1,$2,$3,$4,$5)',[purchaseId,'shippo_tx_1','1Z999','https://track.example/1Z999','https://label.example/1.pdf']),/Sale not found/);
    await as(seller);
    await db.query('select public.record_shipment($1,$2,$3,$4,$5)',[purchaseId,'shippo_tx_1','1Z999','https://track.example/1Z999','https://label.example/1.pdf']);
    const shipped=(await raw('select tracking_number,shipped_at from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(shipped.tracking_number,'1Z999');
    assert.ok(shipped.shipped_at);

    // --- update_tracking_status: service-role only, matched by tracking_number (Shippo's track_updated payload has no transaction id) ---
    await as(seller);
    await assert.rejects(db.query("select public.update_tracking_status('1Z999','TRANSIT')"),/permission denied/);
    await as(seller,'service_role');
    await db.query("select public.update_tracking_status('1Z999','TRANSIT')");
    assert.equal((await raw('select tracking_status from public.purchases where id=$1',[purchaseId])).rows[0].tracking_status,'TRANSIT');

    // --- my_sales(): only the caller's own sales, right shape ---
    await as(seller);
    const sales=(await db.query('select public.my_sales() as s')).rows[0].s;
    assert.equal(sales.length,1);
    assert.equal(sales[0].id,purchaseId);
    assert.equal(sales[0].tracking_number,'1Z999');
    assert.equal(sales[0].tracking_status,'TRANSIT');
    await as(other);
    assert.equal((await db.query('select public.my_sales() as s')).rows[0].s.length,0);

    // --- my_purchases() now includes tracking fields ---
    await as(buyer);
    const mine=(await db.query('select public.my_purchases() as list')).rows[0].list;
    assert.equal(mine[0].tracking_number,'1Z999');
    assert.equal(mine[0].tracking_status,'TRANSIT');
    assert.ok(mine[0].shipped_at);

    // --- authenticated-only functions reject anon ---
    await as(other,'anon');
    await assert.rejects(db.query('select public.save_shipping_address($1)',[ADDRESS]),/permission denied/);
    await assert.rejects(db.query('select public.my_sales()'),/permission denied/);
    await assert.rejects(db.query('select public.record_shipment($1,$2,$3,$4,$5)',[purchaseId,'x','x','x','x']),/permission denied/);
  } finally { await db.close(); }
});
