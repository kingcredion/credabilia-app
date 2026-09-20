import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary.
const source=await readFile(new URL('../supabase/functions/stripe-webhook/handler.js',import.meta.url),'utf8');
const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

test('webhook rejects invalid signatures and retries database failures without accepting unpaid checkout',async()=>{
  let event={type:'checkout.session.completed',data:{object:{id:'cs_test',payment_status:'paid',payment_intent:'pi_test'}}};
  let invalid=false,dbError=true,calls=0;
  class Stripe {
    static createFetchHttpClient(){}
    static createSubtleCryptoProvider(){}
    webhooks={constructEventAsync:async()=>{if(invalid) throw Error('bad signature');return event;}};
  }
  const handler=load(Stripe)({env:()=> 'test',createClient:()=>({rpc:async()=>{calls++;return {error:dbError?{message:'unavailable'}:null};}})});
  const req=signature=>new Request('https://example.test',{method:'POST',headers:signature?{'Stripe-Signature':'test'}:{},body:'{}'});
  assert.equal((await handler(req(false))).status,400);
  invalid=true;assert.equal((await handler(req(true))).status,400);assert.equal(calls,0);
  invalid=false;assert.equal((await handler(req(true))).status,500);assert.equal(calls,1);
  dbError=false;assert.equal((await handler(req(true))).status,200);assert.equal(calls,2);
  event.data.object.payment_status='unpaid';assert.equal((await handler(req(true))).status,200);assert.equal(calls,2);
  for(const type of ['checkout.session.expired','account.updated']) {
    event.type=type;dbError=true;assert.equal((await handler(req(true))).status,500);
  }
});
