import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/vapi-callback-tool/handler.js';

const vapiToolCallBody = (overrides = {}) => ({
  message: {
    type: 'tool-calls',
    toolCallList: [{ id: 'toolu_1', type: 'function', function: { name: 'request_callback', arguments: { reason: overrides.reason ?? 'Question about an order' } } }],
    call: { id: 'call-1', customer: overrides.customer === undefined ? { number: '+15555559876' } : overrides.customer },
  },
});

test('vapi-callback-tool: validates the shared secret, requires a caller number, and texts the operator otherwise',async()=>{
  const secret='test-vapi-secret';
  const sent=[];
  async function sendSms(args) { sent.push(args); }
  const env=key=>({VAPI_CALLBACK_SECRET:secret,TWILIO_ACCOUNT_SID:'AC123',TWILIO_AUTH_TOKEN:'tok',TWILIO_FROM_NUMBER:'+18667500255',OPERATOR_PHONE:'+17028900202'}[key]);
  const handler=createHandler({env,sendSms});
  const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{'x-vapi-secret':secret,'content-type':'application/json',...headers},body:JSON.stringify(body)});

  // wrong secret -> 401, nothing sent
  let res=await handler(request(vapiToolCallBody(),{'x-vapi-secret':'wrong'}));
  assert.equal(res.status,401);
  assert.equal(sent.length,0);

  // missing config -> graceful tool error, not a 500
  const noConfigEnv=key=>({VAPI_CALLBACK_SECRET:secret}[key]);
  res=await createHandler({env:noConfigEnv,sendSms})(request(vapiToolCallBody()));
  assert.equal(res.status,200);
  let json=await res.json();
  assert.equal(json.results[0].toolCallId,'toolu_1');
  assert.match(json.results[0].error,/not connected/);

  // no caller number on the call -> graceful tool error, no Twilio call
  res=await handler(request(vapiToolCallBody({customer:null})));
  json=await res.json();
  assert.match(json.results[0].error,/callback number/);
  assert.equal(sent.length,0);

  // happy path
  res=await handler(request(vapiToolCallBody()));
  assert.equal(res.status,200);
  json=await res.json();
  assert.equal(json.results[0].toolCallId,'toolu_1');
  assert.match(json.results[0].result,/call you back/);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'+17028900202'); // operator, not the caller
  assert.match(sent[0].body,/\+15555559876/); // caller's number relayed in the message
  assert.match(sent[0].body,/Question about an order/);
});
