import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {listingDetails,listingMatches} from '../src/listingDetails.js';
import {createDemoService} from '../src/demo.js';
test('details normalize and survive practice publish/reload/search',async()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const svc=createDemoService(storage);await svc.signIn();
 const id=await svc.createListing({title:'Test baseball',description:'A fictional baseball for testing.',category:'Sports',price_cents:100,attributes:{team:' Chicago '},tags:' Baseball,BASEBALL, blue   jersey',weight_oz:8,length_in:4,width_in:4,height_in:4});
 const item=(await createDemoService(storage).listings()).find(x=>x.id===id);
 assert.deepEqual(item.attributes,{team:'Chicago'});assert.deepEqual(item.tags,['baseball','blue jersey']);
 assert.equal(listingMatches(item,'CHICAGO'),true);assert.equal(listingMatches(item,'blue jersey'),true);
 assert.throws(()=>listingDetails({attributes:{team:'Chicago'}},'Art'));
 assert.throws(()=>listingDetails({tags:Array(9).fill(0).map((_,i)=>String(i))},'Art'));
});
test('database validates and atomically publishes searchable details without scoring changes',async()=>{
 const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));

 await db.exec(await readFile(new URL('../supabase/migrations/202609110006_listing_edits.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202609150007_listing_details.sql',import.meta.url),'utf8'));
 const seller='11111111-1111-4111-8111-111111111111';
 await db.query('insert into auth.users(id) values($1)',[seller]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[seller]);await db.exec('set role authenticated');
 const publish=(attrs,tags)=>db.query("select public.create_listing_with_details('Test baseball','A fictional test description.','Sports',100,'',null,null,null,'[]',$1,$2) as id",[JSON.stringify(attrs),JSON.stringify(tags)]);
 await assert.rejects(publish({artist:'Unknown'},[]),/Unsupported/);
 await assert.rejects(publish({},[42]),/Invalid/);
 assert.equal((await db.query('select * from public.listings')).rows.length,0);
 await publish({team:' Chicago '},['BASEBALL','baseball']);
 await assert.rejects(db.query("update public.listings set tags='[]'"),/permission denied/);
 await db.exec('reset role;set role anon');
 const item=(await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items[0];
 assert.deepEqual(item.attributes,{team:'Chicago'});assert.deepEqual(item.tags,['baseball']);
 assert.equal(item.credibility_score,50);
 await db.exec('reset role');
 await assert.rejects(db.query("update public.listings set category='Art'"),/Category changes/);
 await db.exec('set role anon');
 await assert.rejects(publish({},[]),/permission denied/);
 }finally{await db.close();}
});
