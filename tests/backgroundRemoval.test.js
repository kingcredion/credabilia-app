import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/remove-background/handler.js';

test('consume_background_removal requires selling permission and enforces a 5/hour limit',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609300028_background_removal_quota.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    await as('','anon');await assert.rejects(db.query('select public.consume_background_removal()'),/permission denied|Selling permission required/);
    await as(seller);for(let i=0;i<5;i++) await db.query('select public.consume_background_removal()');
    await as(seller);await assert.rejects(db.query('select public.consume_background_removal()'),/limit reached/);
    await as(seller);await assert.rejects(db.query('delete from public.background_removal_usage'),/permission denied/);
  }finally{await db.close();}
});

test('remove-background handler validates identity, ownership and quotas, streams a transparent PNG',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let calls=0,quota=false,configured=true,validUser=true;
  const handler=createHandler({env:key=>key==='PHOTOROOM_API_KEY' ? (configured?'test-key':null) : 'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:quota?new Error('limit'):null})}),
    fetcher:async(url,options)=>{calls++;assert.equal(url,'https://sdk.photoroom.com/v1/segment');assert.equal(options.headers['x-api-key'],'test-key');return new Response(new Uint8Array([1,2,3]),{status:200,headers:{'Content-Type':'image/png'}});}});
  const request=(body,auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});
  assert.equal((await handler(request({path},false))).status,401);
  validUser=false;assert.equal((await handler(request({path}))).status,401);validUser=true;
  configured=false;assert.equal((await handler(request({path}))).status,503);configured=true;
  assert.equal((await handler(request({path:'https://external.example'}))).status,403);
  quota=true;assert.equal((await handler(request({path}))).status,429);quota=false;
  assert.equal(calls,0);
  const result=await handler(request({path}));assert.equal(result.status,200);
  assert.equal(result.headers.get('Content-Type'),'application/octet-stream');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[1,2,3]);
  assert.equal(calls,1);
});
