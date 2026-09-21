import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('auctions: bidding rules, request_to_buy is blocked, and settlement hands the winner straight into checkout',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',bidder1='22222222-2222-4222-8222-222222222222',
    bidder2='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
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
      create function public.gen_random_bytes(p_len integer) returns bytea language sql as $$select decode(md5(random()::text||clock_timestamp()::text),'hex')$$;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,bidder1,bidder2]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // --- create an auction listing: starting bid $50, 3-day duration ---
    await as(seller);
    await assert.rejects(db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'auction',4)"),/3, 5, or 7 day/);
    const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'auction',3) as id")).rows[0].id;
    let listingRow=(await raw('select listing_type,price_cents,bid_count,auction_ends_at from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listingRow.listing_type,'auction');
    assert.equal(listingRow.price_cents,5000);
    assert.equal(listingRow.bid_count,0);
    assert.ok(listingRow.auction_ends_at);

    // A fixed-price listing (no listing_type args) still works exactly as before -- the two new
    // trailing params are additive, not a breaking change for every other caller.
    const fixedId=(await db.query("select public.create_listing_with_details('Second fictional item','Another fictional description for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    assert.equal((await raw('select listing_type from public.listings where id=$1',[fixedId])).rows[0].listing_type,'fixed');

    // --- seller cannot bid on their own auction ---
    await as(seller);
    await assert.rejects(db.query('select public.place_bid($1,$2)',[listingId,5100]),/cannot bid on your own/);

    // --- bidding rules: must clear starting price, then beat the current price by $1 ---
    await as(bidder1);
    await assert.rejects(db.query('select public.place_bid($1,$2)',[listingId,4999]),/Enter a higher bid/);
    const firstBid=(await db.query('select public.place_bid($1,$2) as r',[listingId,5000])).rows[0].r;
    assert.equal(firstBid.amount_cents,5000);
    assert.equal(firstBid.bid_count,1);
    listingRow=(await raw('select price_cents,bid_count from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listingRow.price_cents,5000);
    assert.equal(listingRow.bid_count,1);

    await as(bidder2);
    await assert.rejects(db.query('select public.place_bid($1,$2)',[listingId,5050]),/Enter a higher bid/); // must beat by $1, not just tie/edge
    const secondBid=(await db.query('select public.place_bid($1,$2) as r',[listingId,5100])).rows[0].r;
    assert.equal(secondBid.amount_cents,5100);
    listingRow=(await raw('select price_cents,bid_count from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listingRow.price_cents,5100);
    assert.equal(listingRow.bid_count,2);

    // --- an auction listing can't be bought outright through the ordinary ask-to-buy path ---
    await as(bidder1);
    await assert.rejects(db.query('select public.request_to_buy($1)',[listingId]),/place a bid instead/);

    // --- bidding after the auction's own end time is rejected, even before cron ever runs ---
    await raw('update public.listings set auction_ends_at=now()-interval \'1 minute\' where id=$1',[listingId]);
    await as(bidder1);
    await assert.rejects(db.query('select public.place_bid($1,$2)',[listingId,5200]),/auction has ended/);

    // --- settlement: the highest bidder (bidder2) is handed a confirmed availability request and
    // can check out immediately, exactly like a regular confirmed buy-request ---
    await as(seller,'service_role');
    const settledCount=(await db.query('select public.settle_ended_auctions() as n')).rows[0].n;
    assert.equal(settledCount,1);
    listingRow=(await raw('select status from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listingRow.status,'pending');
    const avail=(await raw("select * from public.availability_requests where listing_id=$1 and status='confirmed'",[listingId])).rows[0];
    assert.equal(avail.buyer_id,bidder2);

    await as(bidder1); // the losing bidder still can't check out
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2)',[listingId,ADDRESS]),/Ask the seller to confirm/);
    await as(bidder2);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    assert.equal(reservation.price_cents,5100); // the winning bid, not the starting price
    assert.ok(reservation.checkout_session_id);

    // Winning notified via my_notifications() the same way a confirmed buy-request already is.
    const notifications=(await db.query('select public.my_notifications() as n')).rows[0].n;
    assert.ok(notifications.some(x=>x.kind==='buy_request_confirmed' && x.listing_id===listingId));

    // --- an auction with no bids at all just quietly archives, no availability request created ---
    await as(seller);
    const unratedId=(await db.query("select public.create_listing_with_details('No bid item','A fictional description for testing.','Sports',2000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'auction',3) as id")).rows[0].id;
    await raw('update public.listings set auction_ends_at=now()-interval \'1 minute\' where id=$1',[unratedId]);
    await as(seller,'service_role');
    await db.query('select public.settle_ended_auctions()');
    assert.equal((await raw('select status from public.listings where id=$1',[unratedId])).rows[0].status,'archived');
    assert.equal((await raw('select count(*)::int as c from public.availability_requests where listing_id=$1',[unratedId])).rows[0].c,0);

    // --- browse_listings_with_certificates() carries the new auction fields through the whole
    // browse_scored_listings -> browse_listings_with_media -> browse_listings_with_certificates
    // wrapper chain untouched ---
    await as(seller);
    const secondListingId=(await db.query("select public.create_listing_with_details('Active auction item','A fictional description for testing.','Sports',1000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'auction',5) as id")).rows[0].id;
    await as(bidder1);
    const browsed=(await db.query('select public.browse_listings_with_certificates() as l')).rows[0].l;
    const found=browsed.find(item=>item.id===secondListingId);
    assert.equal(found.listing_type,'auction');
    assert.equal(found.bid_count,0);
    assert.ok(found.auction_ends_at);

    // --- permission denied for anon ---
    await as(bidder1,'anon');
    await assert.rejects(db.query('select public.place_bid($1,$2)',[secondListingId,1000]),/permission denied/);
  } finally { await db.close(); }
});
