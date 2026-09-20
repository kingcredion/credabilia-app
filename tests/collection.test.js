import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('profile update, favorites, and simulated-purchase relist groundwork',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100004_media.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}

    await as(seller);
    await assert.rejects(db.query("select public.update_profile('  ')"),/Use a display name/);
    await db.query("select public.update_profile('  Seller Studio  ')");
    assert.equal((await db.query('select display_name from public.profiles where id=$1',[seller])).rows[0].display_name,'Seller Studio');

    const listingId=(await db.query("select public.create_listing('Fictional test item','A fictional description for testing.','Sports',2500,'') as id")).rows[0].id;

    await as(buyer);
    const firstToggle=(await db.query('select public.toggle_favorite($1) as on',[listingId])).rows[0].on;
    assert.equal(firstToggle,true);
    assert.deepEqual((await db.query('select public.my_favorite_ids() as ids')).rows[0].ids,[listingId]);
    const secondToggle=(await db.query('select public.toggle_favorite($1) as on',[listingId])).rows[0].on;
    assert.equal(secondToggle,false);
    assert.deepEqual((await db.query('select public.my_favorite_ids() as ids')).rows[0].ids,[]);

    await as(seller);
    await assert.rejects(db.query('select public.simulate_purchase($1)',[listingId]),/cannot buy your own/);

    await as(buyer);
    const purchaseId=(await db.query('select public.simulate_purchase($1) as id',[listingId])).rows[0].id;
    assert.ok(purchaseId);
    assert.equal((await db.query('select status from public.listings where id=$1',[listingId])).rows[0].status,'sold');
    await assert.rejects(db.query('select public.simulate_purchase($1)',[listingId]),/not available to buy/);

    const mine=(await db.query('select public.my_purchases() as list')).rows[0].list;
    assert.equal(mine.length,1);
    assert.equal(mine[0].id,listingId);
    assert.equal(mine[0].title,'Fictional test item');
    assert.equal(mine[0].price_cents,2500);

    await as(other);
    assert.equal((await db.query('select public.my_purchases() as list')).rows[0].list.length,0);
    assert.deepEqual((await db.query('select public.my_favorite_ids() as ids')).rows[0].ids,[]);
  } finally { await db.close(); }
});
