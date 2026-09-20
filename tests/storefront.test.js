import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('storefront slugs, public storefront reads, relist tracking, and dashboard stats',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    auditor='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3),($4)',[seller,buyer,auditor,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    const listingA=(await db.query("select public.create_listing_with_media('Sold fictional item','A fictional description for testing.','Sports',1000,'') as id")).rows[0].id;
    const listingB=(await db.query("select public.create_listing_with_media('Active fictional item','Another fictional description here.','Sports',2500,'') as id")).rows[0].id;

    // Simulate a completed sale of listing A directly (decoupled from the real Stripe flow, which is tested elsewhere).
    const purchaseId=(await raw("insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,platform_fee_cents) values($1,$2,$3,1000,80) returning id",[listingA,buyer,seller])).rows[0].id;
    await raw("update public.listings set status='sold' where id=$1",[listingA]);

    await as(auditor);
    await db.query("select public.submit_audit($1,'authentic','This looks consistent with the description given.')",[listingB]);

    // --- update_store_slug validation ---
    await as(seller);
    await assert.rejects(db.query("select public.update_store_slug('ab')"),/3-30 characters/);
    await assert.rejects(db.query("select public.update_store_slug('Not Valid!')"),/3-30 characters/);
    await assert.rejects(db.query("select public.update_store_slug('auth')"),/reserved/);
    await db.query("select public.update_store_slug('  Sellers-Shop  ')"); // trimmed + lowercased
    assert.equal((await raw('select slug from public.profiles where id=$1',[seller])).rows[0].slug,'sellers-shop');

    await as(buyer);
    await assert.rejects(db.query("select public.update_store_slug('sellers-shop')"),/already taken/);

    // --- mark_listing_relisted: buyer relists the item they bought ---
    await as(buyer);
    const listingC=(await db.query("select public.create_listing_with_media('Relisted fictional item','A relisted fictional description here.','Sports',1500,'') as id")).rows[0].id;
    // A real purchase owner can't tag a listing that isn't theirs (silent no-op, ownership check on the UPDATE).
    await db.query('select public.mark_listing_relisted($1,$2)',[listingB,purchaseId]);
    assert.equal((await raw('select relisted_from_purchase_id from public.listings where id=$1',[listingB])).rows[0].relisted_from_purchase_id,null);
    // Someone who never bought that purchase can't claim it at all, even for their own listing.
    await as(other);
    await assert.rejects(db.query('select public.mark_listing_relisted($1,$2)',[listingC,purchaseId]),/Purchase not found/);
    await as(buyer);
    await assert.rejects(db.query('select public.mark_listing_relisted($1,$2)',[listingC,'00000000-0000-4000-8000-000000000000']),/Purchase not found/);
    await db.query('select public.mark_listing_relisted($1,$2)',[listingC,purchaseId]);
    assert.equal((await raw('select relisted_from_purchase_id from public.listings where id=$1',[listingC])).rows[0].relisted_from_purchase_id,purchaseId);

    // --- get_storefront: public read, only safe fields, only active listings ---
    await as(other);
    const storefront=(await db.query("select public.get_storefront('sellers-shop') as s")).rows[0].s;
    assert.equal(storefront.display_name,'Collector'); // bootstrap_account()'s default display name
    assert.deepEqual(Object.keys(storefront).sort(),['display_name','listings','member_since','sales_count','slug']);
    assert.equal(storefront.slug,'sellers-shop');
    assert.equal(storefront.sales_count,1);
    assert.equal(storefront.listings.length,1);
    assert.equal(storefront.listings[0].id,listingB);
    assert.deepEqual(Object.keys(storefront.listings[0]).sort(),['category','id','media','price_cents','title']);

    // Callable by anon (genuinely public) and returns null for an unknown slug.
    await as(other,'anon');
    const anonStorefront=(await db.query("select public.get_storefront('sellers-shop') as s")).rows[0].s;
    assert.equal(anonStorefront.slug,'sellers-shop');
    assert.equal((await db.query("select public.get_storefront('no-such-store') as s")).rows[0].s,null);

    // --- my_dashboard_stats ---
    await as(seller);
    const sellerStats=(await db.query('select public.my_dashboard_stats() as s')).rows[0].s;
    assert.equal(sellerStats.items_sold,1);
    assert.equal(sellerStats.revenue_cents,920); // seller_payout_cents = price_cents(1000) - platform_fee_cents(80)
    assert.equal(sellerStats.items_bought,0);
    assert.equal(sellerStats.audits_received,1);

    await as(buyer);
    const buyerStats=(await db.query('select public.my_dashboard_stats() as s')).rows[0].s;
    assert.equal(buyerStats.items_bought,1);
    assert.equal(buyerStats.items_relisted,1);
    assert.equal(buyerStats.items_sold,0);

    await as(auditor);
    assert.equal((await db.query('select public.my_dashboard_stats() as s')).rows[0].s.audits_given,1);

    // --- authenticated-only functions reject anon ---
    await as(other,'anon');
    await assert.rejects(db.query('select public.my_dashboard_stats()'),/permission denied/);
    await assert.rejects(db.query("select public.update_store_slug('whatever')"),/permission denied/);
    await assert.rejects(db.query('select public.mark_listing_relisted($1,$2)',[listingC,purchaseId]),/permission denied/);

    // --- my_purchases() now exposes purchase_id ---
    await as(buyer);
    const mine=(await db.query('select public.my_purchases() as list')).rows[0].list;
    assert.equal(mine[0].purchase_id,purchaseId);
  } finally { await db.close(); }
});
