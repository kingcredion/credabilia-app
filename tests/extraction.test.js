import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/extract-certificate/handler.js';

test('AI handler validates identity, ownership and quotas, strips extra model fields',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let calls=0,quota=false,configured=true,validUser=true;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY' ? (configured?'test-key':null) : 'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})})})},rpc:async()=>({error:quota?new Error('limit'):null})}),
    fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'),true);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({issuer:'PSA',certificate_number:'00001234',url:'https://untrusted.example',score:100})}]}]});}});
  const request=(body,auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});
  assert.equal((await handler(request({path},false))).status,401);
  validUser=false;assert.equal((await handler(request({path}))).status,401);validUser=true;
  configured=false;assert.equal((await handler(request({path}))).status,503);configured=true;
  assert.equal((await handler(request({path:'https://external.example'}))).status,403);
  quota=true;assert.equal((await handler(request({path}))).status,429);quota=false;
  assert.equal(calls,0);
  const result=await handler(request({path}));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{issuer:'PSA',certificate_number:'00001234'});assert.equal(calls,1);
});
