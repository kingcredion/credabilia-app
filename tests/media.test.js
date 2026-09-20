import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateImage,mediaInput} from '../src/media.js';

test('reject unsupported files, oversize files and excessive photo counts',()=>{
  assert.throws(()=>validateImage({type:'image/svg+xml',size:100}));
  assert.throws(()=>validateImage({type:'image/jpeg',size:6*1024*1024}));
  assert.doesNotThrow(()=>validateImage({type:'image/jpeg',size:100}));
  assert.throws(()=>mediaInput(Array.from({length:4},()=>({kind:'certificate',path:'test'}))));
});

test('private staging, photo ownership, atomic publishing, immutable evidence and AI quotas',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const path=seller+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    const upload=()=>db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)",[path]);
    const publish=(assets)=>db.query("select public.create_listing_with_media('Photo fixture','Fictional item with photo evidence.','Sports',2500,'','psa','00001234',null,$1) as id",[JSON.stringify(assets)]);
    await as(other);await assert.rejects(upload(),/row-level security/);
    await as(seller);await upload();
    await as('','anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await as(other);await assert.rejects(publish([{path,kind:'item'}]),/owner/);
    await as(seller);await assert.rejects(publish([{path:seller+'/missing.jpg',kind:'item'}]),/missing/);
    assert.equal((await db.query('select * from public.listings')).rows.length,0);
    const id=(await publish([{path,kind:'item'}])).rows[0].id;
    await assert.rejects(publish([{path,kind:'item'}]),/unique constraint/);
    assert.equal((await db.query('select * from public.listings')).rows.length,1);
    assert.equal((await db.query('delete from storage.objects returning *')).rows.length,0);
    assert.equal((await db.query("update storage.objects set name='changed' returning *")).rows.length,0);
    for(let i=0;i<5;i++) await db.query('select public.consume_certificate_read()');
    await assert.rejects(db.query('select public.consume_certificate_read()'),/limit reached/);
    await assert.rejects(db.query('delete from public.certificate_read_usage'),/permission denied/);
    await as('','anon');
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    const item=(await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items[0];
    assert.equal(item.media[0].path,path);assert.equal(item.credibility_score,86);
    await db.exec('reset role');await db.query("update public.listings set status='archived' where id=$1",[id]);
    await as('','anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await as(seller);assert.equal((await db.query('delete from storage.objects returning *')).rows.length,0);
  }finally{await db.close();}
});
