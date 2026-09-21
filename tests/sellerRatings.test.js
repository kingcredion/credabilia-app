import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('seller ratings: rate/edit lifecycle, permissions, and public aggregates on listings and storefronts',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    other='33333333-3333-4333-8333-333333333333';
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
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    // A second, still-active listing from the same seller -- the sold one above flips to 'sold' and
    // drops out of browse_listings(), so the public aggregate has to be checked on a listing that stays visible.
    const listing2Id=(await db.query("select public.create_listing_with_details('Second fictional item','Another fictional description for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await db.query("select public.update_store_slug('sellers-shop')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // Full real checkout path: request-to-buy confirmation, reserve, attach, finalize (as the
    // webhook would) -- this is how a genuine `purchases` row comes to exist, same as production.
    await as(buyer);
    const request=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[request.id]);
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    await db.query('select public.attach_stripe_checkout_session($1,$2)',[reservation.checkout_session_id,'cs_test_1']);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_1','pi_test_1') as id")).rows[0].id;

    // --- rate_seller: validation ---
    await as(buyer);
    await assert.rejects(db.query('select public.rate_seller($1,$2)',[purchaseId,0]),/between 1 and 5/);
    await assert.rejects(db.query('select public.rate_seller($1,$2)',[purchaseId,6]),/between 1 and 5/);
    await assert.rejects(db.query('select public.rate_seller($1,$2,$3)',[purchaseId,5,'x'.repeat(501)]),/under 500 characters/);

    // Only the actual buyer on that purchase can rate it.
    await as(seller);
    await assert.rejects(db.query('select public.rate_seller($1,$2)',[purchaseId,5]),/Purchase not found/);
    await as(other);
    await assert.rejects(db.query('select public.rate_seller($1,$2)',[purchaseId,5]),/Purchase not found/);
    await assert.rejects(db.query('select public.rate_seller($1,$2)',['00000000-0000-4000-8000-000000000000',5]),/Purchase not found/);

    // --- rate_seller: happy path + upsert (editing a rating updates in place, not a new row) ---
    await as(buyer);
    const firstRating=(await db.query('select public.rate_seller($1,$2,$3) as r',[purchaseId,4,'Good, a bit slow to ship.'])).rows[0].r;
    assert.equal(firstRating.rating,4);
    assert.equal(firstRating.comment,'Good, a bit slow to ship.');
    const updatedRating=(await db.query('select public.rate_seller($1,$2,$3) as r',[purchaseId,5,'Actually great, item arrived safely.'])).rows[0].r;
    assert.equal(updatedRating.rating,5);
    assert.equal(updatedRating.id,firstRating.id); // same row, upserted -- not a duplicate
    assert.equal((await raw('select count(*)::int as c from public.seller_ratings',[])).rows[0].c,1);

    // A blank comment normalizes to null rather than an empty string.
    await db.query('select public.rate_seller($1,$2)',[purchaseId,3]);
    assert.equal((await raw('select comment from public.seller_ratings where purchase_id=$1',[purchaseId])).rows[0].comment,null);
    await db.query('select public.rate_seller($1,$2,$3) as r',[purchaseId,5,'Actually great, item arrived safely.']); // restore for the assertions below

    // --- my_purchases() surfaces the buyer's own rating ---
    const mine=(await db.query('select public.my_purchases() as list')).rows[0].list;
    assert.equal(mine[0].my_rating,5);
    assert.equal(mine[0].my_rating_comment,'Actually great, item arrived safely.');

    // --- RLS: raw table access is locked down to the two participants, never a bystander ---
    const ratingRow=(await raw('select id from public.seller_ratings where purchase_id=$1',[purchaseId])).rows[0];
    await as(buyer);
    assert.equal((await db.query('select * from public.seller_ratings where id=$1',[ratingRow.id])).rows.length,1);
    await as(seller);
    assert.equal((await db.query('select * from public.seller_ratings where id=$1',[ratingRow.id])).rows.length,1);
    await as(other);
    assert.equal((await db.query('select * from public.seller_ratings where id=$1',[ratingRow.id])).rows.length,0);
    await as(other,'anon');
    await assert.rejects(db.query('select public.rate_seller($1,$2)',[purchaseId,5]),/permission denied/);

    // --- Public aggregate: shows up on the seller's still-active listing, not just the sold one ---
    await as(other);
    const listings=(await db.query('select public.browse_listings_with_certificates() as l')).rows[0].l;
    const activeListing=listings.find(item=>item.id===listing2Id);
    assert.equal(activeListing.seller_rating_avg,5);
    assert.equal(activeListing.seller_rating_count,1);
    assert.equal(activeListing.seller_sales_count,1);
    assert.ok(activeListing.seller_member_since);

    // --- Public aggregate + review list: storefront ---
    const storefront=(await db.query("select public.get_storefront('sellers-shop') as s")).rows[0].s;
    assert.equal(storefront.rating_avg,5);
    assert.equal(storefront.rating_count,1);
    assert.equal(storefront.reviews.length,1);
    assert.equal(storefront.reviews[0].rating,5);
    assert.equal(storefront.reviews[0].comment,'Actually great, item arrived safely.');
    assert.equal(storefront.reviews[0].buyer_name,'Collector'); // bootstrap_account()'s default display name

    // A seller with no ratings yet shows null averages, not a division-by-zero error or a 0.
    await as(other);
    const otherListingId=(await db.query("select public.create_listing_with_details('Unrated seller item','A fictional description for testing.','Sports',2000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    const listings2=(await db.query('select public.browse_listings_with_certificates() as l')).rows[0].l;
    const unratedListing=listings2.find(item=>item.id===otherListingId);
    assert.equal(unratedListing.seller_rating_avg,null);
    assert.equal(unratedListing.seller_rating_count,0);
  } finally { await db.close(); }
});
