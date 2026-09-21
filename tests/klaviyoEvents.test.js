import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('Klaviyo events fire at each lifecycle moment with the right payload shape, and stay silent with no configured key',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
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
      -- A spy stand-in for pg_net, which PGlite doesn't ship -- records every call so the test can
      -- inspect the exact payload notify_klaviyo builds, instead of only checking "did it not crash".
      create schema net;
      create table net._http_calls(id serial primary key,url text,body jsonb,headers jsonb,called_at timestamptz default now());
      create function net.http_post(url text,body jsonb default null,headers jsonb default null,timeout_milliseconds integer default null) returns bigint
        language plpgsql as $$ declare new_id bigint; begin insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    // --- No configured key: every trigger point must stay completely silent, never crash the
    // real action it's attached to (matches notify_push's own guarantee). ---
    await raw('insert into auth.users(id,email) values($1,$2),($3,$4)',[seller,'sam.seller@example.test',buyer,'jamie.buyer@example.test']);
    assert.equal((await raw('select count(*)::int as c from net._http_calls')).rows[0].c,0); // Signed Up fired silently for both signups above

    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(buyer);
    const request=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[request.id]);
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    await db.query('select public.attach_stripe_checkout_session($1,$2)',[reservation.checkout_session_id,'cs_test_klaviyo']);
    await as(buyer,'service_role');
    await db.query("select public.finalize_checkout_session('cs_test_klaviyo','pi_test_klaviyo')");
    assert.equal((await raw('select count(*)::int as c from net._http_calls')).rows[0].c,0); // still silent -- no key configured anywhere above

    // --- Configure a key: every trigger point must now actually call out, with the right shape. ---
    await raw("select vault.create_secret('test-klaviyo-key','klaviyo_private_api_key')");

    const other='33333333-3333-4333-8333-333333333333';
    await raw('insert into auth.users(id,email) values($1,$2)',[other,'other@example.test']);
    let calls=(await raw('select * from net._http_calls order by id')).rows;
    assert.equal(calls.length,1); // Signed Up
    assert.equal(calls[0].url,'https://a.klaviyo.com/api/events');
    assert.equal(calls[0].headers.Authorization,'Klaviyo-API-Key test-klaviyo-key');
    assert.equal(calls[0].headers['Content-Type'],'application/vnd.api+json');
    assert.equal(calls[0].body.data.type,'event');
    assert.equal(calls[0].body.data.attributes.metric.data.attributes.name,'Signed Up');
    assert.equal(calls[0].body.data.attributes.profile.data.attributes.email,'other@example.test');

    await as(other);
    const listing2Id=(await db.query("select public.create_listing_with_details('Second fictional item','Another fictional description for testing.','Sports',3000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    calls=(await raw('select * from net._http_calls order by id')).rows;
    const itemListed=calls.find(c=>c.body.data.attributes.metric.data.attributes.name==='Item Listed');
    assert.ok(itemListed,'Item Listed did not fire');
    assert.equal(itemListed.body.data.attributes.profile.data.attributes.email,'other@example.test');
    assert.equal(itemListed.body.data.attributes.properties.listing_id,listing2Id);
    assert.equal(itemListed.body.data.attributes.properties.title,'Second fictional item');

    // Auction settlement: bidder wins, gets "Auction Won"; checking out afterward still fires
    // Purchase Completed/Item Sold exactly like a regular purchase.
    await as(seller);
    const auctionId=(await db.query("select public.create_listing_with_details('Auction item','A fictional description for testing.','Sports',1000,'',null,null,null,'[]','{}','[]',8,8,6,4,false,'auction',3) as id")).rows[0].id;
    await as(buyer);
    await db.query('select public.place_bid($1,$2)',[auctionId,1000]);
    await raw('update public.listings set auction_ends_at=now()-interval \'1 minute\' where id=$1',[auctionId]);
    await as(seller,'service_role');
    await db.query('select public.settle_ended_auctions()');
    calls=(await raw('select * from net._http_calls order by id')).rows;
    const auctionWon=calls.find(c=>c.body.data.attributes.metric.data.attributes.name==='Auction Won');
    assert.ok(auctionWon,'Auction Won did not fire');
    assert.equal(auctionWon.body.data.attributes.profile.data.attributes.email,'jamie.buyer@example.test');
    assert.equal(auctionWon.body.data.attributes.properties.winning_bid_cents,1000);

    await as(buyer);
    const reservation2=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[auctionId,ADDRESS])).rows[0].r;
    await db.query('select public.attach_stripe_checkout_session($1,$2)',[reservation2.checkout_session_id,'cs_test_klaviyo_2']);
    await as(buyer,'service_role');
    await db.query("select public.finalize_checkout_session('cs_test_klaviyo_2','pi_test_klaviyo_2')");
    calls=(await raw('select * from net._http_calls order by id')).rows;
    const purchaseCompleted=calls.find(c=>c.body.data.attributes.metric.data.attributes.name==='Purchase Completed' && c.body.data.attributes.properties.listing_id===auctionId);
    const itemSold=calls.find(c=>c.body.data.attributes.metric.data.attributes.name==='Item Sold' && c.body.data.attributes.properties.listing_id===auctionId);
    assert.ok(purchaseCompleted,'Purchase Completed did not fire');
    assert.equal(purchaseCompleted.body.data.attributes.profile.data.attributes.email,'jamie.buyer@example.test');
    assert.ok(itemSold,'Item Sold did not fire');
    assert.equal(itemSold.body.data.attributes.profile.data.attributes.email,'sam.seller@example.test');

    // --- Credion Coins Earned: one event per winning auditor for the monthly reward pool ---
    await as(other);
    const auditListingId=(await db.query("select public.create_listing_with_details('Auditable fictional item','A fictional description for testing audits.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await as(buyer);
    await db.query("select public.submit_audit($1,'authentic','This looks consistent with the description given.')",[auditListingId]);
    const periodStart=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-1,1));
    const withinPeriod=new Date(periodStart.getTime()+5*24*3600*1000).toISOString();
    await raw('update public.reward_events set created_at=$1 where user_id=$2',[withinPeriod,buyer]);
    await raw("insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,platform_fee_cents,created_at) values($1,$2,$3,5000,720,$4)",[auditListingId,other,seller,withinPeriod]);

    await raw('reset role');
    await db.query('select public.run_monthly_auditor_rewards()');
    calls=(await raw('select * from net._http_calls order by id')).rows;
    const coinsEarned=calls.find(c=>c.body.data.attributes.metric.data.attributes.name==='Credion Coins Earned');
    assert.ok(coinsEarned,'Credion Coins Earned did not fire');
    assert.equal(coinsEarned.body.data.attributes.profile.data.attributes.email,'jamie.buyer@example.test');
    assert.equal(coinsEarned.body.data.attributes.properties.amount_cents,36); // round(720*0.05)/1 winner
  } finally { await db.close(); }
});
