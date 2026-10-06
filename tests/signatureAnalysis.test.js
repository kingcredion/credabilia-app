import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/analyze-signature/handler.js';

const jpeg=()=>new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'});
const opinion=(label,note)=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({label,note})}]}]});
const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
const NO_SIGNER=' No signer was named, so King Credion could not compare it with his signature library.';

test('analyze-signature handler validates identity, path ownership and quota, and returns a labeled opinion',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  let calls=0,quota=false,configured=true,validUser=true;
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY' ? (configured?'test-key':null) : 'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},storage:{from:()=>({download:async()=>({data:jpeg()})})},rpc:async()=>({error:quota?new Error('limit'):null})}),
    fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'),true);return opinion('consistent','The pen stroke looks natural, with normal pressure variation.');}});
  const asRequest=(body,auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});

  assert.equal((await handler(asRequest({path},false))).status,401);
  validUser=false;assert.equal((await handler(asRequest({path}))).status,401);validUser=true;
  configured=false;assert.equal((await handler(asRequest({path}))).status,503);configured=true;
  assert.equal((await handler(asRequest({path:'https://external.example'}))).status,403);
  quota=true;assert.equal((await handler(asRequest({path}))).status,429);quota=false;
  assert.equal(calls,0);

  const result=await handler(asRequest({path}));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{label:'consistent',note:'The pen stroke looks natural, with normal pressure variation.'+NO_SIGNER,library_total:null,references_compared:0,written:null});
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
      storage:{from:()=>({download:async()=>({data:jpeg()})})},
      from:table=>{assert.equal(table,'listing_media');return {select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{path:sigPath}})})})})};},
      rpc:async(name,args)=>{
        if(name==='submit_signature_opinion'){submitCalls++;submitArgs=args;return {data:{written:true}};}
        return {error:null};
      },
    }),
    fetcher:async url=>{
      if(url==='https://api.openai.com/v1/responses') return opinion('consistent','Looks natural.');
      throw new Error('unexpected fetch '+url);
    }});
  // Note: sigPath is prefixed with sellerId, not buyerId -- the whole point of this test is that
  // the listing_id branch bypasses the uid-prefix check entirely, validating against the DB instead.
  const result=await handler(request({path:sigPath,listing_id:listingId}));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.label,'consistent');
  assert.equal(data.written,true);
  assert.equal(submitCalls,1);
  assert.deepEqual(submitArgs,{p_listing_id:listingId,p_label:'consistent',p_note:'Looks natural.'+NO_SIGNER});
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
  const result=await handler(request({path:'someone/not-the-right-file.jpg',listing_id:listingId}));
  assert.equal(result.status,403);
  assert.equal(calls,0);
});

// Builds a handler whose library lookup returns {total, paths}; records what the model was shown.
function libraryHandler({total,paths,profile,lookupError=false,reviewNote='Looks natural.'}) {
  const id='11111111-1111-4111-8111-111111111111';
  const seen={rpc:null,content:null,instructions:null,downloads:[]};
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY'?'test-key':'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},
      storage:{from:()=>({download:async p=>{seen.downloads.push(p);return {data:jpeg()};}})},
      rpc:async(name,args)=>{
        if(name==='signature_reference_images'){seen.rpc=args;return lookupError?{data:null,error:new Error('boom')}:{data:{total,paths,name:profile}};}
        return {error:null};
      }}),
    fetcher:async(url,options)=>{const body=JSON.parse(options.body);seen.content=body.input[0].content;seen.instructions=body.instructions;return opinion('consistent',reviewNote);}});
  return {handler,seen,path:id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'};
}

test('analyze-signature compares against verified examples of the named signer once the library has enough, and says so',async()=>{
  const {handler,seen,path}=libraryHandler({total:5,paths:['r1.jpg','r2.jpg','r3.jpg'],reviewNote:'The slant and letter shapes match the examples.'});
  const data=await (await handler(request({path,subject:'Michael Jordan'}))).json();
  assert.equal(seen.rpc.p_subject,'Michael Jordan');
  assert.deepEqual(seen.downloads.slice(1),['r1.jpg','r2.jpg','r3.jpg'],'downloads the verified examples after the photo under review');
  assert.equal(seen.content.filter(c=>c.type==='input_image').length,4,'the photo plus three verified examples');
  assert.match(seen.instructions,/Compare the first image with the verified examples/);
  assert.equal(data.references_compared,3);
  assert.equal(data.library_total,5);
  assert.equal(data.note,'The slant and letter shapes match the examples. King Credion compared it with 3 of the 5 verified examples of Michael Jordan\'s signature in his library.');
});

test('analyze-signature falls back to a first impression and says the library is still too small, never overclaiming',async()=>{
  let ctx=libraryHandler({total:2,paths:['r1.jpg','r2.jpg']});
  let data=await (await ctx.handler(request({path:ctx.path,subject:'Michael Jordan'}))).json();
  assert.equal(ctx.seen.content.filter(c=>c.type==='input_image').length,1,'two examples is below the minimum, so no comparison');
  assert.match(ctx.seen.instructions,/no reference signatures to compare against/);
  assert.equal(data.references_compared,0);
  assert.equal(data.note,'Looks natural. King Credion\'s library has only 2 verified examples of Michael Jordan\'s signature so far, not enough to compare yet.');

  ctx=libraryHandler({total:1,paths:['r1.jpg']});
  data=await (await ctx.handler(request({path:ctx.path,subject:'Ada Lovelace'}))).json();
  assert.match(data.note,/has only 1 verified example of Ada Lovelace's signature so far/);

  ctx=libraryHandler({total:0,paths:[]});
  data=await (await ctx.handler(request({path:ctx.path,subject:'Somebody New'}))).json();
  assert.equal(data.note,'Looks natural. King Credion\'s library has no verified examples of Somebody New\'s signature yet, so he could not compare it.');
});

test('analyze-signature still returns a clean opinion, with no claim about the library, when the library lookup itself fails',async()=>{
  const {handler,path}=libraryHandler({lookupError:true});
  const data=await (await handler(request({path,subject:'Someone'}))).json();
  assert.equal(data.label,'consistent');
  assert.equal(data.note,'Looks natural.');
  assert.equal(data.library_total,null);
});

test('analyze-signature keeps the whole stored note within 500 characters',async()=>{
  const {handler,path}=libraryHandler({total:0,paths:[],reviewNote:'x'.repeat(900)});
  const data=await (await handler(request({path,subject:'A'.repeat(120)}))).json();
  assert.ok(data.note.length<=500,'stored note limit is 500');
  assert.match(data.note,/yet, so he could not compare it\.$/);
});

test('analyze-signature handler falls back to "inconclusive" for an unrecognized label',async()=>{
  const id='11111111-1111-4111-8111-111111111111',path=id+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const handler=createHandler({env:()=>'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:()=>({download:async()=>({data:jpeg()})})},rpc:async()=>({error:null})}),
    fetcher:async()=>opinion('definitely authentic','x')});
  const result=await handler(request({path}));
  assert.equal(result.status,200);
  assert.equal((await result.json()).label,'inconclusive');
});

test('analyze-signature reports the signer under the library profile name, so a different spelling reads correctly and shares the same examples',async()=>{
  const {handler,seen,path}=libraryHandler({total:4,paths:['r1.jpg','r2.jpg','r3.jpg'],profile:'Mike Tyson',reviewNote:'Slant and flourishes match.'});
  const data=await (await handler(request({path,subject:'michael tyson'}))).json();
  assert.equal(seen.rpc.p_subject,'michael tyson','the typed name is what is looked up; the library resolves it through the profile');
  assert.equal(data.note,'Slant and flourishes match. King Credion compared it with 3 of the 4 verified examples of Mike Tyson\'s signature in his library.');
  const small=libraryHandler({total:1,paths:['r1.jpg'],profile:'Mike Tyson'});
  const smallData=await (await small.handler(request({path:small.path,subject:'mike tyson jr'}))).json();
  assert.match(smallData.note,/only 1 verified example of Mike Tyson's signature so far/);
});
