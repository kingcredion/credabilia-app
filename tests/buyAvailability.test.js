import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('checkout requires a confirmed availability request: request/confirm/decline lifecycle, no double booking, and self-healing expiry',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    otherBuyer='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;
      -- Minimal stand-ins for Supabase's pgcrypto/Vault, which PGlite doesn't ship -- just enough
      -- for 202609300032's vault.create_secret(...) seeding statement to run.
      create schema vault;
      create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text,created_at timestamptz not null default now());
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(p_secret text,p_name text,p_description text default null) returns uuid language plpgsql as $$
        declare new_id uuid; begin insert into vault.secrets(name,secret,description) values(p_name,p_secret,p_description) returning id into new_id; return new_id; end;$$;
      create function public.gen_random_bytes(p_len integer) returns bytea language sql as $$select decode(md5(random()::text||clock_timestamp()::text),'hex')$$;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,otherBuyer]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // Checkout is refused outright with no request in play at all -- the whole point of this feature.
    await as(buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2)',[listingId,ADDRESS]),/Ask the seller to confirm/);

    // A seller can't request availability confirmation on their own listing.
    await as(seller);
    await assert.rejects(db.query('select public.request_to_buy($1)',[listingId]),/cannot buy your own listing/);

    // Buyer asks; listing locks (status flips to 'pending', so it drops out of public browse).
    await as(buyer);
    const request1=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    assert.equal(request1.status,'pending');
    let listingRow=(await raw('select status from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listingRow.status,'pending');

    // No double booking: a second buyer can't open a competing request while one is open.
    await as(otherBuyer);
    await assert.rejects(db.query('select public.request_to_buy($1)',[listingId]),/not available to buy/);

    // Checkout is still refused for the requesting buyer until the seller actually confirms.
    await as(buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2)',[listingId,ADDRESS]),/Ask the seller to confirm/);

    // Only the seller can respond, and only while the request is still pending.
    await as(otherBuyer);
    await assert.rejects(db.query('select public.respond_to_buy_request($1,true)',[request1.id]),/not found/);

    // Seller declines: listing unlocks, buyer is free to ask again (or someone else can).
    await as(seller);
    const declined=(await db.query('select public.respond_to_buy_request($1,false) as r',[request1.id])).rows[0].r;
    assert.equal(declined.status,'declined');
    listingRow=(await raw('select status from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listingRow.status,'active');
    await assert.rejects(db.query('select public.respond_to_buy_request($1,true)',[request1.id]),/already been answered/);

    // Second attempt: seller confirms this time, and checkout succeeds only for that buyer.
    await as(otherBuyer);
    const request2=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    await as(seller);
    const confirmed=(await db.query('select public.respond_to_buy_request($1,true) as r',[request2.id])).rows[0].r;
    assert.equal(confirmed.status,'confirmed');

    await as(buyer); // the original buyer never got confirmed -- still refused
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2)',[listingId,ADDRESS]),/Ask the seller to confirm/);

    await as(otherBuyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    assert.equal(reservation.price_cents,5000);
    assert.ok(reservation.checkout_session_id);

    // my_open_buy_requests()/my_buy_requests() surface the right shape to each side.
    await as(otherBuyer);
    const mine=(await db.query('select public.my_open_buy_requests() as r')).rows[0].r;
    assert.equal(mine.length,1); assert.equal(mine[0].status,'confirmed'); assert.equal(mine[0].title,'Fictional item');
    await as(seller);
    const pendingForSeller=(await db.query('select public.my_buy_requests() as r')).rows[0].r;
    assert.equal(pendingForSeller.length,0,'the confirmed request should not still show as pending for the seller');

    // Self-healing expiry, on a fresh listing so the confirmed-and-checked-out state above (which
    // legitimately holds its own 30-minute checkout_session lock) can't interfere: a buyer opens a
    // request, the seller confirms it, but the buyer never checks out and the 24h window lapses.
    // The next request_to_buy for that listing (by anyone) must clean it up and succeed -- no cron.
    await as(seller);
    const listing2Id=(await db.query("select public.create_listing_with_details('Second fictional item','Another fictional description for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await as(buyer);
    const staleRequest=(await db.query('select public.request_to_buy($1) as r',[listing2Id])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[staleRequest.id]);
    await raw('update public.availability_requests set expires_at=now()-interval \'1 minute\' where id=$1',[staleRequest.id]);
    const fourthBuyer='44444444-4444-4444-8444-444444444444';
    await raw('insert into auth.users(id) values($1)',[fourthBuyer]);
    await as(fourthBuyer);
    const request3=(await db.query('select public.request_to_buy($1) as r',[listing2Id])).rows[0].r;
    assert.equal(request3.status,'pending');
    const staleRow=(await raw('select status from public.availability_requests where id=$1',[staleRequest.id])).rows[0];
    assert.equal(staleRow.status,'expired');
  } finally { await db.close(); }
});
