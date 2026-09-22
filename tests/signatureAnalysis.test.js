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
  assert.deepEqual(await result.json(),{label:'consistent',note:'The pen stroke looks natural, with normal pressure variation.'});
  assert.equal(calls,1);
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
