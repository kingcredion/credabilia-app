import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/voice-tools/handler.js';

const FIXTURE_LISTINGS=[
  {title:'Barry Bond signed baseball',category:'Sports',price_cents:20000,credibility_score:30,status:'active'},
  {title:'Three Phillies-signed baseballs with Beckett COA',category:'Sports',price_cents:15000,credibility_score:84,status:'active'},
];

test('voice-tools validates the shared secret and answers check_item_availability from real listing data',async()=>{
  const secret='test-secret';
  const env=key=>({VAPI_TOOL_SECRET:secret,SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon'}[key]);
  const createClient=()=>({rpc:async name=>name==='browse_listings_with_certificates' ? {data:FIXTURE_LISTINGS,error:null} : {data:null,error:new Error('unexpected rpc')}});
  const handler=createHandler({createClient,env});
  const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{'x-vapi-secret':secret,...headers},body:JSON.stringify(body)});
  // Vapi's real toolCallList nests name/arguments under `.function` (OpenAI tool-call shape), not
  // flat on the call object -- this caught a live bug where the handler read the wrong fields.
  const toolCallMessage=(name,args)=>({message:{type:'tool-calls',toolCallList:[{id:'call-1',type:'function',function:{name,arguments:args}}]}});

  assert.equal((await handler(request(toolCallMessage('check_item_availability',{query:'baseball'}),{'x-vapi-secret':'wrong'}))).status,401);

  const noneFound=await handler(request(toolCallMessage('check_item_availability',{query:'a signed jersey nobody has'})));
  assert.equal(noneFound.status,200);
  let body=await noneFound.json();
  assert.match(body.results[0].result,/No active listing matching/);
  assert.equal(body.results[0].toolCallId,'call-1');

  const found=await handler(request(toolCallMessage('check_item_availability',{query:'Barry Bond'})));
  body=await found.json();
  assert.match(body.results[0].result,/Barry Bond signed baseball/);
  assert.match(body.results[0].result,/\$200\.00/);
  assert.match(body.results[0].result,/30 out of 100/);

  // A query broad enough to match both fixtures is capped, not a runaway list.
  const broad=await handler(request(toolCallMessage('check_item_availability',{query:'sports'})));
  body=await broad.json();
  assert.match(body.results[0].result,/Barry Bond/);
  assert.match(body.results[0].result,/Phillies/);

  const unknownTool=await handler(request(toolCallMessage('some_other_tool',{})));
  body=await unknownTool.json();
  assert.equal(body.results[0].result,'That tool is not available.');

  // arguments sometimes arrive as a JSON-encoded string rather than an object.
  const stringArgs={message:{type:'tool-calls',toolCallList:[{id:'call-2',type:'function',function:{name:'check_item_availability',arguments:JSON.stringify({query:'Barry Bond'})}}]}};
  const stringArgsRes=await handler(request(stringArgs));
  body=await stringArgsRes.json();
  assert.match(body.results[0].result,/Barry Bond signed baseball/);

  // The real payload embeds the whole call so far (transcript, assistant config, etc), which can
  // run well past a small size cap -- this must still be processed, not rejected as "invalid".
  const bulky={message:{type:'tool-calls',toolCallList:[{id:'call-3',type:'function',function:{name:'check_item_availability',arguments:{query:'Barry Bond'}}}],artifact:{filler:'x'.repeat(500_000)}}};
  const bulkyRes=await handler(request(bulky));
  assert.equal(bulkyRes.status,200);
  body=await bulkyRes.json();
  assert.match(body.results[0].result,/Barry Bond signed baseball/);
});
