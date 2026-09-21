import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('Credion Coins apply up to 50% of the item price at checkout, not just the platform fee',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222';
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
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300037_credion_coins.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,buyer]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',10000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // Simulate the buyer having earned $80 in Credion Coins from a past monthly auditor reward.
    await raw("insert into public.credit_events(user_id,amount_cents,reason) values($1,8000,'Top 10% auditor reward — test')",[buyer]);

    await as(buyer);
    const request=(await db.query('select public.request_to_buy($1) as r',[listingId])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[request.id]);

    // Item is $100. Old behavior would cap coins at the platform fee (~$14). New behavior caps at
    // 50% of price ($50) -- asking to apply the full $80 balance should only spend $50.
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2,$3) as r',[listingId,ADDRESS,8000])).rows[0].r;
    assert.equal(reservation.applied_credit_cents,5000);
    const spentEvent=(await raw("select amount_cents from public.credit_events where user_id=$1 and reason='Applied to checkout'",[buyer])).rows[0];
    assert.equal(spentEvent.amount_cents,-5000);
    const remainingBalance=(await db.query('select public.my_credit_balance() as b')).rows[0].b;
    assert.equal(remainingBalance,3000); // 8000 earned - 5000 spent

    // Still can't apply more than the actual balance, regardless of the 50% cap.
    await as(seller);
    const listing2Id=(await db.query("select public.create_listing_with_details('Second fictional item','Another fictional description for testing.','Sports',20000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await as(buyer);
    const request2=(await db.query('select public.request_to_buy($1) as r',[listing2Id])).rows[0].r;
    await as(seller);
    await db.query('select public.respond_to_buy_request($1,true)',[request2.id]);
    await as(buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2,$3)',[listing2Id,ADDRESS,5000]),/do not have that much credit/);
  } finally { await db.close(); }
});
