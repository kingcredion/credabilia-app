import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('eBay-style fee formula, real shipping cost, credit spend/refund, and the monthly auditor reward pool',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    auditorA='33333333-3333-4333-8333-333333333333',auditorB='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3),($4),($5)',[seller,buyer,auditorA,auditorB,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    // --- platform_fee_cents(): eBay's 13.6% + $0.30/$0.40 ---
    await as(seller);
    assert.equal((await db.query('select public.platform_fee_cents(1000) as f')).rows[0].f,166); // round(136)+30, price<=$10
    assert.equal((await db.query('select public.platform_fee_cents(1001) as f')).rows[0].f,176); // round(136.136)+40, price>$10
    assert.equal((await db.query('select public.platform_fee_cents(5000) as f')).rows[0].f,720); // round(680)+40

    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // --- create_listing_with_details requires real package dimensions now ---
    await as(seller);
    await assert.rejects(db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',null,null,null,null,false)"),/valid package weight and size/);
    const buyerPaysListing=(await db.query("select public.create_listing_with_details('Buyer pays shipping item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    const freeShippingListing=(await db.query("select public.create_listing_with_details('Free shipping item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,true) as id")).rows[0].id;
    assert.equal((await raw('select weight_oz,free_shipping from public.listings where id=$1',[buyerPaysListing])).rows[0].free_shipping,false);
    assert.equal((await raw('select free_shipping from public.listings where id=$1',[freeShippingListing])).rows[0].free_shipping,true);

    // --- reserve_listing_checkout returns everything needed to quote shipping ---
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[buyerPaysListing,ADDRESS])).rows[0].r;
    assert.equal(reservation.free_shipping,false);
    assert.equal(reservation.parcel.weight_oz,8);
    assert.equal(reservation.seller_shipping_address.name,'Sam Seller');
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_buyerpays',$2)",[reservation.checkout_session_id,895]); // e.g. $8.95 marked-up quote

    // --- finalize: buyer-pays-shipping does not reduce seller's payout ---
    await as(buyer,'service_role');
    const purchaseId1=(await db.query("select public.finalize_checkout_session('cs_test_buyerpays','pi_test_buyerpays') as id")).rows[0].id;
    const p1=(await raw('select platform_fee_cents,seller_payout_cents,shipping_cost_cents,seller_shipping_charge_cents from public.purchases where id=$1',[purchaseId1])).rows[0];
    assert.equal(p1.platform_fee_cents,720); // platform_fee_cents(5000)
    assert.equal(p1.shipping_cost_cents,895);
    assert.equal(p1.seller_shipping_charge_cents,0);
    assert.equal(p1.seller_payout_cents,5000-720); // shipping never touches seller payout here

    // --- free-shipping: the marked-up shipping cost comes out of the seller's payout instead ---
    await as(buyer);
    const reservation2=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[freeShippingListing,ADDRESS])).rows[0].r;
    assert.equal(reservation2.free_shipping,true);
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_free',$2)",[reservation2.checkout_session_id,650]);
    await as(buyer,'service_role');
    const purchaseId2=(await db.query("select public.finalize_checkout_session('cs_test_free','pi_test_free') as id")).rows[0].id;
    const p2=(await raw('select platform_fee_cents,seller_payout_cents,seller_shipping_charge_cents from public.purchases where id=$1',[purchaseId2])).rows[0];
    assert.equal(p2.platform_fee_cents,720); // selling fee is identical either way
    assert.equal(p2.seller_shipping_charge_cents,650);
    assert.equal(p2.seller_payout_cents,5000-720-650); // seller absorbs the marked-up shipping cost

    // --- credit: earn some, spend at checkout capped at the platform's own fee, refund on cancel ---
    await raw("insert into public.credit_events(user_id,amount_cents,reason) values($1,1000,'test seed')",[buyer]);
    await as(buyer);
    assert.equal((await db.query('select public.my_credit_balance() as b')).rows[0].b,1000);
    await as(seller);
    const listing3b=(await db.query("select public.create_listing_with_details('Fourth fictional item','A fourth fictional description here.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    await as(buyer);
    const reservation3=(await db.query('select public.reserve_listing_checkout($1,$2,$3) as r',[listing3b,ADDRESS,1000])).rows[0].r;
    assert.equal(reservation3.applied_credit_cents,720); // capped at platform_fee_cents(5000)=720, not the full $10 balance
    assert.equal((await db.query('select public.my_credit_balance() as b')).rows[0].b,1000-720);
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_credit',$2)",[reservation3.checkout_session_id,0]);
    await db.query("select public.cancel_checkout_session('cs_test_credit')");
    assert.equal((await db.query('select public.my_credit_balance() as b')).rows[0].b,1000); // canceling refunds the applied credit

    // --- applying more credit than you have is rejected ---
    await as(buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1,$2,$3)',[listing3b,ADDRESS,100000]),/do not have that much credit/);

    // --- monthly auditor reward pool ---
    await as(seller);
    const auditListing1=(await db.query("select public.create_listing_with_details('Auditable fictional item one','A fictional description for testing audits.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    const auditListing2=(await db.query("select public.create_listing_with_details('Auditable fictional item two','A fictional description for testing audits.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
    const periodStart=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-1,1));
    const withinPeriod=new Date(periodStart.getTime()+5*24*3600*1000).toISOString();
    // Two auditors active last month, A audits twice (more active -> ranks ahead of B under ntile).
    await as(auditorA);
    await db.query("select public.submit_audit($1,'authentic','This looks consistent with the description given.')",[auditListing1]);
    await db.query("select public.submit_audit($1,'authentic','This also looks consistent with the description given.')",[auditListing2]);
    await as(auditorB);
    await db.query("select public.submit_audit($1,'uncertain','Needs more evidence before I would trust this one.')",[auditListing1]);
    // submit_audit() always timestamps as "now" -- backdate these specific reward_events rows into last month so the tally has something to rank.
    await raw('update public.reward_events set created_at=$1 where user_id in ($2,$3)',[withinPeriod,auditorA,auditorB]);
    // A purchase last month establishes last month's fee-revenue base for the pool.
    await raw("insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,platform_fee_cents,created_at) values($1,$2,$3,5000,720,$4)",[auditListing1,buyer,seller,withinPeriod]);

    await db.query('select public.run_monthly_auditor_rewards()');
    const run=(await raw('select pool_cents,winner_count from public.reward_pool_runs where period_start=$1',[periodStart.toISOString()])).rows[0];
    assert.equal(run.pool_cents,36); // round(720*0.05)
    assert.ok(run.winner_count>=1);
    const auditorACredits=(await raw("select coalesce(sum(amount_cents),0) as c from public.credit_events where user_id=$1 and reason like 'Top 10%%'",[auditorA])).rows[0].c;
    assert.ok(Number(auditorACredits)>0); // the more-active auditor got a reward credit

    // Idempotent: calling again for the same period does not double-pay.
    await db.query('select public.run_monthly_auditor_rewards()');
    const runCount=(await raw('select count(*)::int as n from public.reward_pool_runs where period_start=$1',[periodStart.toISOString()])).rows[0].n;
    assert.equal(runCount,1);

    // --- authenticated-only functions reject anon ---
    await as(other,'anon');
    await assert.rejects(db.query('select public.my_credit_balance()'),/permission denied/);
    await assert.rejects(db.query('select public.run_monthly_auditor_rewards()'),/permission denied/);
  } finally { await db.close(); }
});
