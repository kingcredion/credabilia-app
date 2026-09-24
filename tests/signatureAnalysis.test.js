import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/analyze-signature/handler.js';

test('analyze-signature handler validates identity, path ownership and quota, and returns a labeled opinion',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let calls=0,quota=false,configured=true,validUser=true;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY' ? (configured?'test-key':null) : 'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:quota?new Error('limit'):null})}),
    fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'),true);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({label:'consistent',note:'The pen stroke looks natural, with normal pressure variation.'})}]}]});}});
  const request=(body,auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});

  assert.equal((await handler(request({path},false))).status,401);
  validUser=false;assert.equal((await handler(request({path}))).status,401);validUser=true;
  configured=false;assert.equal((await handler(request({path}))).status,503);configured=true;
  assert.equal((await handler(request({path:'https://external.example'}))).status,403);
  quota=true;assert.equal((await handler(request({path}))).status,429);quota=false;
  assert.equal(calls,0);

  const result=await handler(request({path}));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{label:'consistent',note:'The pen stroke looks natural, with normal pressure variation.',reference_match_count:null,reference_similarity:null,written:null});
  assert.equal(calls,1);
});

test('analyze-signature handler accepts a listing_id-validated path for a non-owner caller, and writes the opinion via a service-role RPC',async()=>{
  const buyerId='22222222-2222-4222-8222-222222222222';
  const sellerId='11111111-1111-4111-8111-111111111111';
  const listingId='33333333-3333-4333-8333-333333333333';
  const sigPath=sellerId+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let submitArgs=null,submitCalls=0;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY'?'test-key':'test',
    createClient:()=>({
      auth:{getUser:async()=>({data:{user:{id:buyerId}}})},
      storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},
      from:table=>{assert.equal(table,'listing_media');return {select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{path:sigPath}})})})})};},
      rpc:async(name,args)=>{
        if(name==='submit_signature_opinion'){submitCalls++;submitArgs=args;return {data:{written:true}};}
        return {error:null};
      },
    }),
    fetcher:async url=>{
      if(url==='https://api.openai.com/v1/responses') return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({label:'consistent',note:'Looks natural.'})}]}]});
      throw new Error('unexpected fetch '+url);
    }});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
  // Note: sigPath is prefixed with sellerId, not buyerId -- the whole point of this test is that
  // the listing_id branch bypasses the uid-prefix check entirely, validating against the DB instead.
  const result=await handler(request({path:sigPath,listing_id:listingId}));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.label,'consistent');
  assert.equal(data.written,true);
  assert.equal(submitCalls,1);
  assert.deepEqual(submitArgs,{p_listing_id:listingId,p_label:'consistent',p_note:'Looks natural.'});
});

test('analyze-signature handler rejects a listing_id path that is not that listing\'s actual signature media, without calling OpenAI',async()=>{
  const buyerId='22222222-2222-4222-8222-222222222222';
  const listingId='33333333-3333-4333-8333-333333333333';
  let calls=0;
  const handler=createHandler({env:()=>'test',
    createClient:()=>({
      auth:{getUser:async()=>({data:{user:{id:buyerId}}})},
      from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})}),
    }),
    fetcher:async()=>{calls++;throw new Error('should not fetch');}});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
  const result=await handler(request({path:'someone/not-the-right-file.jpg',listing_id:listingId}));
  assert.equal(result.status,403);
  assert.equal(calls,0);
});

test('analyze-signature handler compares against the reference library when a subject is given',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const vector=Array.from({length:1536},(_,i)=>i%2===0?0.1:-0.1);
  let searchArgs=null;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY'?'test-key':'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},
      rpc:async(name,args)=>{ if(name==='search_signature_references'){searchArgs=args;return {data:[{id:'a',similarity:0.9},{id:'b',similarity:0.7}]};} return {error:null}; }}),
    fetcher:async(url,options)=>{
      if(url==='https://api.openai.com/v1/responses') return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({label:'consistent',note:'Natural pressure and flow.'})}]}]});
      if(url==='https://api.openai.com/v1/embeddings') { const body=JSON.parse(options.body); assert.equal(body.model,'text-embedding-3-small'); assert.equal(body.input,'Natural pressure and flow.'); return Response.json({data:[{embedding:vector}]}); }
      throw new Error('unexpected fetch '+url);
    }});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
  const result=await handler(request({path,subject:'Michael Jordan'}));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.reference_match_count,2);
  assert.equal(data.reference_similarity,0.8);
  assert.equal(searchArgs.p_subject,'Michael Jordan');
  assert.equal(searchArgs.p_embedding,'['+vector.join(',')+']');
});

test('analyze-signature handler still returns a clean opinion when the reference lookup itself fails',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY'?'test-key':'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:null})}),
    fetcher:async(url)=>{
      if(url==='https://api.openai.com/v1/responses') return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({label:'consistent',note:'Looks fine.'})}]}]});
      return new Response('server error',{status:500});
    }});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
  const result=await handler(request({path,subject:'Someone'}));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.label,'consistent');
  assert.equal(data.reference_match_count,null);
  assert.equal(data.reference_similarity,null);
});

test('analyze-signature handler falls back to "inconclusive" for an unrecognized label',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const handler=createHandler({env:()=>'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:null})}),
    fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({label:'definitely authentic',note:'x'})}]}]})});
  const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
  const result=await handler(request({path:id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'}));
  assert.equal(result.status,200);
  assert.equal((await result.json()).label,'inconclusive');
});
