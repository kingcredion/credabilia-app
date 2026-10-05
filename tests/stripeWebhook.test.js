import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary.
const source=await readFile(new URL('../supabase/functions/stripe-webhook/handler.js',import.meta.url),'utf8');
const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

test('webhook rejects invalid signatures and retries database failures without accepting unpaid checkout',async()=>{
  let event={type:'checkout.session.completed',data:{object:{id:'cs_test',payment_status:'paid',payment_intent:'pi_test'}}};
  let invalid=false,dbError=true,calls=0;const alerts=[];
  class Stripe {
    static createFetchHttpClient(){}
    static createSubtleCryptoProvider(){}
    webhooks={constructEventAsync:async()=>{if(invalid) throw Error('bad signature');return event;}};
  }
  const handler=load(Stripe)({env:()=> 'test',createClient:()=>({rpc:async(name,args)=>{if(name==='notify_operator_alert'){alerts.push(args);return {error:null};}calls++;return {error:dbError?{message:'unavailable'}:null};}})});
  const req=signature=>new Request('https://example.test',{method:'POST',headers:signature?{'Stripe-Signature':'test'}:{},body:'{}'});
  assert.equal((await handler(req(false))).status,400);
  invalid=true;assert.equal((await handler(req(true))).status,400);assert.equal(calls,0);
  invalid=false;assert.equal((await handler(req(true))).status,500);assert.equal(calls,1);
  assert.equal(alerts.length,1,'a paid checkout that could not be recorded alerts the operator');
  assert.equal(alerts[0].p_event,'Admin Alert: Payment Problem');assert.equal(alerts[0].p_properties.reference,'cs_test');
  dbError=false;assert.equal((await handler(req(true))).status,200);assert.equal(calls,2);
  event.data.object.payment_status='unpaid';assert.equal((await handler(req(true))).status,200);assert.equal(calls,2);
  for(const type of ['checkout.session.expired','account.updated']) {
    event.type=type;dbError=true;assert.equal((await handler(req(true))).status,500);
  }
  assert.equal(alerts.length,1,'expired sessions and account updates failing do not alert');
});

test('webhook records the buyer card and the seller bank account, alerts on a banned member match, and never fails the webhook over it',async()=>{
  let event,blocked=false,retrieveFails=false;
  const rpcCalls=[],alerts=[];
  class Stripe {
    static createFetchHttpClient(){}
    static createSubtleCryptoProvider(){}
    webhooks={constructEventAsync:async()=>event};
    paymentIntents={retrieve:async()=>{if(retrieveFails) throw Error('stripe down');return {latest_charge:{payment_method_details:{card:{fingerprint:'card_fp_abcdef'}}}};}};
  }
  const client={
    rpc:async(name,args)=>{
      if(name==='notify_operator_alert'){alerts.push(args);return {error:null};}
      rpcCalls.push([name,args]);
      if(name==='finalize_checkout_session') return {data:'purchase-1',error:null};
      if(name==='record_payment_fingerprint') return {data:{blocked},error:null};
      return {error:null};
    },
    from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='purchases'?{buyer_id:'buyer-1'}:{user_id:'seller-1'}})})})}),
  };
  const handler=load(Stripe)({env:()=> 'test',createClient:()=>client});
  const req=()=>new Request('https://example.test',{method:'POST',headers:{'Stripe-Signature':'test'},body:'{}'});

  event={type:'checkout.session.completed',data:{object:{id:'cs_1',payment_status:'paid',payment_intent:'pi_1'}}};
  assert.equal((await handler(req())).status,200);
  const cardCall=rpcCalls.find(c=>c[0]==='record_payment_fingerprint');
  assert.deepEqual(cardCall[1],{p_user_id:'buyer-1',p_kind:'card',p_fingerprint:'card_fp_abcdef',p_purchase_id:'purchase-1'});
  assert.equal(alerts.length,0,'an ordinary card does not alert');

  blocked=true;
  assert.equal((await handler(req())).status,200);
  assert.equal(alerts.length,1);
  assert.match(alerts[0].p_properties.summary,/banned member/);

  retrieveFails=true;
  assert.equal((await handler(req())).status,200,'a Stripe lookup failure never fails the webhook');

  rpcCalls.length=0;alerts.length=0;blocked=false;
  event={type:'account.updated',data:{object:{id:'acct_1',charges_enabled:true,details_submitted:true,external_accounts:{data:[{fingerprint:'bank_fp_abcdef'},{object:'card'}]}}}};
  assert.equal((await handler(req())).status,200);
  const bankCall=rpcCalls.find(c=>c[0]==='record_payment_fingerprint');
  assert.deepEqual(bankCall[1],{p_user_id:'seller-1',p_kind:'bank',p_fingerprint:'bank_fp_abcdef'});
  blocked=true;
  assert.equal((await handler(req())).status,200);
  assert.match(alerts[0].p_properties.summary,/bank account tied to a banned member/);
});
