import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('get_listing_preview: public fields for an active listing only, callable by anon',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609300072_listing_preview.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,buyer]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    const activeId=(await db.query("select public.create_listing_with_media('Fictional preview item','A fictional description for testing.','Sports',2500,'') as id")).rows[0].id;
    const soldId=(await db.query("select public.create_listing_with_media('Fictional sold item','Another fictional description.','Sports',1500,'') as id")).rows[0].id;
    const noPhotoId=(await db.query("select public.create_listing_with_media('Fictional photoless item','Yet another fictional description.','Sports',900,'') as id")).rows[0].id;
    await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.jpg']);
    await raw("insert into public.listing_media(path,listing_id,kind,position) values($1,$2,'item',0)",[seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.jpg',activeId]);
    await raw("update public.listings set status='sold' where id=$1",[soldId]);

    // --- anon can read an active listing's public preview fields ---
    await as('','anon');
    const preview=(await db.query('select public.get_listing_preview($1) as p',[activeId])).rows[0].p;
    assert.equal(preview.title,'Fictional preview item');
    assert.equal(preview.price_cents,2500);
    assert.equal(preview.category,'Sports');
    assert.equal(preview.photo_path,seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.jpg');

    // --- an active listing with no item photo yet just has a null photo_path, not an error ---
    const noPhoto=(await db.query('select public.get_listing_preview($1) as p',[noPhotoId])).rows[0].p;
    assert.equal(noPhoto.title,'Fictional photoless item');
    assert.equal(noPhoto.photo_path,null);

    // --- not active (sold) -> null, never leaks title/price for a link to a no-longer-available item ---
    const soldPreview=(await db.query('select public.get_listing_preview($1) as p',[soldId])).rows[0].p;
    assert.equal(soldPreview,null);

    // --- nonexistent id -> null, not an error ---
    const missing=(await db.query("select public.get_listing_preview('00000000-0000-4000-8000-000000000000') as p")).rows[0].p;
    assert.equal(missing,null);

    // --- signed-in roles can call it too ---
    await as(buyer);
    const asBuyer=(await db.query('select public.get_listing_preview($1) as p',[activeId])).rows[0].p;
    assert.equal(asBuyer.title,'Fictional preview item');
  } finally { await db.close(); }
});
