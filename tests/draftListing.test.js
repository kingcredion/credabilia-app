import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/draft-listing/handler.js';

test('draft handler validates identity, notes, ownership and quotas, and sanitizes the model output',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let calls=0,quota=false,configured=true,validUser=true;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY' ? (configured?'test-key':null) : 'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:quota?new Error('limit'):null})}),
    fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
        title:'  Autographed baseball  ',description:'A vintage signed baseball.',category:'Sports',
        attributes:{item_type:'Autographed baseball',subject:null,year:'1968',condition:null,sport:'Baseball',team:null,artist:null,medium:null,dimensions:null,publisher:null,issue:null,grading_company:null,grade:null},
        tags:['Vintage','vintage',' Baseball ','x'.repeat(50),...Array.from({length:10},(_,i)=>'tag'+i)],
        price:1000000,authenticity:'genuine',url:'https://untrusted.example'
      })}]}]});}});
  const request=(body,auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});
  assert.equal((await handler(request({notes:'A baseball'},false))).status,401);
  validUser=false;assert.equal((await handler(request({notes:'A baseball'}))).status,401);validUser=true;
  configured=false;assert.equal((await handler(request({notes:'A baseball'}))).status,503);configured=true;
  assert.equal((await handler(request({notes:'  '}))).status,400);
  assert.equal((await handler(request({notes:'A baseball',photo_path:'https://external.example'}))).status,403);
  quota=true;assert.equal((await handler(request({notes:'A baseball'}))).status,429);quota=false;
  assert.equal(calls,0);
  const result=await handler(request({notes:'A baseball',photo_path:path}));
  assert.equal(result.status,200);assert.equal(calls,1);
  const data=await result.json();
  assert.equal(data.title,'Autographed baseball');
  assert.equal(data.category,'Sports');
  assert.deepEqual(data.attributes,{item_type:'Autographed baseball',year:'1968',sport:'Baseball'});
  assert.deepEqual(data.tags,['vintage','baseball','x'.repeat(40),'tag0','tag1','tag2','tag3','tag4']);
  assert.equal('price' in data,false);assert.equal('authenticity' in data,false);assert.equal('url' in data,false);
});

test('draft handler drafts from a photo alone with no notes, and rejects when neither is given',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let calls=0;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY'?'test-key':'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:null})}),
    fetcher:async(url,options)=>{calls++;const body=JSON.parse(options.body);
      assert.deepEqual(body.input[0].content.map(c=>c.type),['input_image']); // no notes -> no input_text block
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
        title:'Signed jersey',description:'A red jersey, number 10.',category:'Sports',
        attributes:{item_type:null,subject:null,year:null,condition:null,sport:'Football',team:null,artist:null,medium:null,dimensions:null,publisher:null,issue:null,grading_company:null,grade:null},
        tags:[],signature:{found:false,box:null}
      })}]}]});}});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
  assert.equal((await handler(request({notes:'',photo_path:path}))).status,200);
  assert.equal(calls,1);
  assert.equal((await handler(request({notes:''}))).status,400); // neither notes nor photo
});

test('draft handler validates and clamps the signature detection box, and only returns one when a photo was sent',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let signaturePayload={found:true,box:{x0:0.2,y0:0.3,x1:0.6,y1:0.5}};
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY'?'test-key':'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:null})}),
    fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
      title:'Item',description:'A fictional item for testing.',category:'Sports',
      attributes:{item_type:null,subject:null,year:null,condition:null,sport:null,team:null,artist:null,medium:null,dimensions:null,publisher:null,issue:null,grading_company:null,grade:null},
      tags:[],signature:signaturePayload
    })}]}]})});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});

  let result=await handler(request({notes:'A baseball',photo_path:path}));
  assert.deepEqual((await result.json()).signature,{found:true,box:{x0:0.2,y0:0.3,x1:0.6,y1:0.5}});

  signaturePayload={found:true,box:{x0:0.8,y0:0.2,x1:0.4,y1:0.5}}; // x1<x0: degenerate, must be treated as not found
  result=await handler(request({notes:'A baseball',photo_path:path}));
  assert.deepEqual((await result.json()).signature,{found:false,box:null});

  signaturePayload={found:true,box:{x0:-0.5,y0:0.3,x1:1.5,y1:0.5}}; // out-of-range coordinates get clamped, not rejected, as long as still ordered
  result=await handler(request({notes:'A baseball',photo_path:path}));
  assert.deepEqual((await result.json()).signature,{found:true,box:{x0:0,y0:0.3,x1:1,y1:0.5}});

  signaturePayload={found:true,box:{x0:0.2,y0:0.3,x1:0.6,y1:0.5}};
  result=await handler(request({notes:'A baseball'})); // no photo sent -- never trust a signature claim without one
  assert.deepEqual((await result.json()).signature,{found:false,box:null});
});

test('database enforces listing draft quota and selling permission',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609160008_listing_draft.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,other]);
    await db.query('update public.account_permissions set can_sell=false where user_id=$1',[other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    await as(other);
    await assert.rejects(db.query('select public.consume_listing_draft()'),/Selling permission required/);
    await as(seller);
    for(let i=0;i<5;i++) await db.query('select public.consume_listing_draft()');
    await assert.rejects(db.query('select public.consume_listing_draft()'),/limit reached/);
    await assert.rejects(db.query('delete from public.listing_draft_usage'),/permission denied/);
  } finally { await db.close(); }
});
