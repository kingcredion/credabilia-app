import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Stripe Connect checkout reservation, finalize/expire, and payment-readiness gates',async()=>{
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
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    // Ground-truth reads bypass RLS (as the superuser) -- a buyer mid-checkout or a stale
    // session's original buyer are deliberately not visible to whichever role is active,
    // same as a 'sold' listing is already invisible to non-participants today.
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    // simulate_purchase must be gone -- a real Stripe flow can't leave a free-purchase backdoor.
    assert.equal((await db.query("select 1 from pg_proc where proname='simulate_purchase'")).rows.length,0);

    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_media('Fictional test item','A fictional description for testing.','Sports',2500,'') as id")).rows[0].id;

    // Buying is blocked until the seller has a Stripe account with charges enabled.
    await as(buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1)',[listingId]),/has not finished payment setup/);

    await as(seller);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    // Not yet approved by Stripe -- still blocked.
    await as(buyer);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1)',[listingId]),/has not finished payment setup/);

    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // Sellers can't buy their own listing.
    await as(seller);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1)',[listingId]),/cannot buy your own/);

    // Happy path reservation.
    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1) as r',[listingId])).rows[0].r;
    assert.equal(reservation.price_cents,2500);
    assert.equal(reservation.stripe_account_id,'acct_test_seller');
    const checkoutSessionId=reservation.checkout_session_id;
    assert.equal((await raw('select status from public.listings where id=$1',[listingId])).rows[0].status,'pending');

    // A second buyer cannot reserve the same listing while checkout is in flight
    // (mirrors simulate_purchase's sequential-call precedent: the earlier active-status
    // check catches this before the optimistic row-count guard ever needs to fire).
    await as(other);
    await assert.rejects(db.query('select public.reserve_listing_checkout($1)',[listingId]),/not available to buy/);

    // Attaching the real Stripe session id is scoped to the reserving buyer.
    await as(other);
    await assert.rejects(db.query("select public.attach_stripe_checkout_session($1,'cs_test_wrong')",[checkoutSessionId]),/not found/);
    await as(buyer);
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_1')",[checkoutSessionId]);

    // Canceling releases the listing back to active.
    await db.query("select public.cancel_checkout_session('cs_test_1')");
    assert.equal((await db.query('select status from public.listings where id=$1',[listingId])).rows[0].status,'active');
    assert.equal((await db.query("select status from public.checkout_sessions where stripe_checkout_session_id='cs_test_1'")).rows[0].status,'canceled');
    // Canceling again (or a session that never existed) is a harmless no-op, not an error.
    await db.query("select public.cancel_checkout_session('cs_test_1')");

    // Reserve again for the finalize/expire tests below.
    const reservation2=(await db.query('select public.reserve_listing_checkout($1) as r',[listingId])).rows[0].r;
    await db.query('select public.attach_stripe_checkout_session($1,$2)',[reservation2.checkout_session_id,'cs_test_2']);

    // Only the service role may finalize or expire a checkout -- never a signed-in buyer.
    await assert.rejects(db.query("select public.finalize_checkout_session('cs_test_2','pi_test_2')"),/permission denied/);
    await assert.rejects(db.query("select public.expire_checkout_session('cs_test_2')"),/permission denied/);

    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_2','pi_test_2') as id")).rows[0].id;
    assert.ok(purchaseId);
    assert.equal((await raw('select status from public.listings where id=$1',[listingId])).rows[0].status,'sold');
    const purchase=(await raw('select platform_fee_cents,seller_payout_cents,price_cents from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(purchase.price_cents,2500);
    assert.equal(purchase.platform_fee_cents,200); // round(2500*0.08)
    assert.equal(purchase.seller_payout_cents,2300);

    // Finalizing again (a webhook retry) is idempotent -- same purchase, no duplicate.
    await as(buyer,'service_role');
    const repeatId=(await db.query("select public.finalize_checkout_session('cs_test_2','pi_test_2') as id")).rows[0].id;
    assert.equal(repeatId,purchaseId);
    assert.equal((await raw('select count(*)::int as n from public.purchases where listing_id=$1',[listingId])).rows[0].n,1);

    // Expiring a completed session is a no-op, not an error.
    await as(buyer,'service_role');
    await db.query("select public.expire_checkout_session('cs_test_2')");
    assert.equal((await raw('select status from public.listings where id=$1',[listingId])).rows[0].status,'sold');

    // Fee rounding at another price point.
    await as(seller);
    const listing2=(await db.query("select public.create_listing_with_media('Another fictional item','A second fictional description here.','Comics',12345,'') as id")).rows[0].id;
    await as(buyer);
    const reservation3=(await db.query('select public.reserve_listing_checkout($1) as r',[listing2])).rows[0].r;
    await db.query('select public.attach_stripe_checkout_session($1,$2)',[reservation3.checkout_session_id,'cs_test_3']);
    await as(buyer,'service_role');
    const purchaseId3=(await db.query("select public.finalize_checkout_session('cs_test_3','pi_test_3') as id")).rows[0].id;
    assert.equal((await raw('select platform_fee_cents from public.purchases where id=$1',[purchaseId3])).rows[0].platform_fee_cents,988); // round(12345*0.08)=987.6->988

    // A listing left stuck on 'pending' (e.g. a lost webhook) self-heals on the next reservation attempt.
    await as(seller);
    const listing3=(await db.query("select public.create_listing_with_media('A third fictional item','A third fictional description here.','Art',5000,'') as id")).rows[0].id;
    await db.exec('reset role');
    await db.query("update public.listings set status='pending' where id=$1",[listing3]);
    await db.query("insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,status,expires_at) values($1,$2,$3,5000,'cs_test_stale','pending',now()-interval '1 hour')",[listing3,other,seller]);
    await as(buyer);
    const healed=(await db.query('select public.reserve_listing_checkout($1) as r',[listing3])).rows[0].r;
    assert.ok(healed.checkout_session_id);
    assert.equal((await raw("select status from public.checkout_sessions where stripe_checkout_session_id='cs_test_stale'")).rows[0].status,'expired');

    // RLS: another signed-in user cannot see someone else's Stripe account or checkout session.
    await as(other);
    assert.equal((await db.query('select * from public.stripe_accounts where user_id=$1',[seller])).rows.length,0);
    assert.equal((await db.query("select * from public.checkout_sessions where stripe_checkout_session_id='cs_test_2'")).rows.length,0);
    await as(buyer);
    assert.equal((await db.query("select * from public.checkout_sessions where stripe_checkout_session_id='cs_test_2'")).rows.length,1);

    // save_stripe_account never lets a seller self-report as onboarded, and is idempotent per user.
    await as(other);
    await db.query("select public.save_stripe_account('acct_test_other')");
    await db.query("select public.save_stripe_account('acct_test_other_again')");
    assert.equal((await db.query('select stripe_account_id,charges_enabled from public.stripe_accounts where user_id=$1',[other])).rows[0].stripe_account_id,'acct_test_other');
    assert.equal((await db.query('select stripe_account_id,charges_enabled from public.stripe_accounts where user_id=$1',[other])).rows[0].charges_enabled,false);

    // browse_listings_with_certificates() surfaces payment-readiness to buyers.
    await as(seller);
    const onboardedListing=(await db.query("select public.create_listing_with_media('A fourth fictional item','A fourth fictional description here.','History',3000,'') as id")).rows[0].id;
    await as(other);
    const unonboardedListing=(await db.query("select public.create_listing_with_media('A fifth fictional item','A fifth fictional description here.','History',3000,'') as id")).rows[0].id;
    const browsed=(await db.query('select id,seller_charges_enabled from jsonb_to_recordset(public.browse_listings_with_certificates()) as x(id uuid,seller_charges_enabled boolean)')).rows;
    assert.equal(browsed.find(row=>row.id===onboardedListing)?.seller_charges_enabled,true); // seller (charges_enabled) is onboarded
    assert.equal(browsed.find(row=>row.id===unonboardedListing)?.seller_charges_enabled,false); // other never completed onboarding
  } finally { await db.close(); }
});
