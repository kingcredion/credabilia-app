import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary.
const loadHandler=async(dir,Stripe)=>{
  const source=await readFile(new URL(`../supabase/functions/${dir}/handler.js`,import.meta.url),'utf8');
  return new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;')(Stripe);
};

test('setup-bidding-card needs sign-in and opens a Stripe save-card page tagged with the member, charging nothing',async()=>{
  let created=null;
  class Stripe {
    static createFetchHttpClient(){}
    checkout={sessions:{create:async params=>{created=params;return {url:'https://checkout.stripe.test/setup'};}}};
  }
  const make=user=>({env:key=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',STRIPE_SECRET_KEY:'sk',APP_URL:'https://credabilia.com'}[key]),
    createClient:()=>({auth:{getUser:async()=>user?({data:{user:{id:'member-1',email:'m@example.test'}},error:null}):({data:{user:null},error:{message:'no'}})}})});
  const createHandler=await loadHandler('setup-bidding-card',Stripe);
  const post=(handler,auth='Bearer t')=>handler(new Request('https://example.test',{method:'POST',headers:auth?{Authorization:auth}:{},body:'{}'}));

  assert.equal((await post(createHandler(make(true)),null)).status,401);
  assert.equal((await post(createHandler(make(false)))).status,401);
  const res=await post(createHandler(make(true)));
  assert.equal(res.status,200);
  assert.equal((await res.json()).url,'https://checkout.stripe.test/setup');
  assert.equal(created.mode,'setup');
  assert.deepEqual(created.payment_method_types,['card']);
  assert.equal(created.client_reference_id,'member-1');
  assert.equal(created.line_items,undefined,'nothing is charged');
  assert.match(created.custom_text.submit.message,/Nothing is charged now/);
  assert.match(created.success_url,/bidcard=success/);
});

test('the webhook records a saved bidding card without touching the order code, alerts on a banned card, and never fails over it',async()=>{
  let event,blocked=false,retrieveFails=false;
  const rpcCalls=[],alerts=[];
  class Stripe {
    static createFetchHttpClient(){}
    static createSubtleCryptoProvider(){}
    webhooks={constructEventAsync:async()=>event};
    setupIntents={retrieve:async()=>{if(retrieveFails) throw Error('stripe down');return {payment_method:{card:{fingerprint:'card_fp_bidder_1'}}};}};
  }
  const client={rpc:async(name,args)=>{
    if(name==='notify_operator_alert'){alerts.push(args);return {error:null};}
    rpcCalls.push([name,args]);
    if(name==='record_bid_card') return {data:{blocked},error:null};
    return {error:null};
  }};
  const createHandler=await loadHandler('stripe-webhook',Stripe);
  const handler=createHandler({env:()=> 'test',createClient:()=>client});
  const req=()=>new Request('https://example.test',{method:'POST',headers:{'Stripe-Signature':'test'},body:'{}'});

  event={type:'checkout.session.completed',data:{object:{id:'cs_setup',mode:'setup',payment_status:'no_payment_required',setup_intent:'seti_1',client_reference_id:'member-1'}}};
  assert.equal((await handler(req())).status,200);
  assert.deepEqual(rpcCalls,[['record_bid_card',{p_user_id:'member-1',p_fingerprint:'card_fp_bidder_1'}]]);
  assert.ok(!rpcCalls.some(c=>c[0]==='finalize_checkout_session'),'a saved card is not an order');
  assert.equal(alerts.length,0);

  blocked=true;
  assert.equal((await handler(req())).status,200);
  assert.match(alerts[0].p_properties.summary,/banned member/);

  retrieveFails=true;
  assert.equal((await handler(req())).status,200,'a Stripe lookup failure never fails the webhook');

  rpcCalls.length=0;
  event={type:'checkout.session.expired',data:{object:{id:'cs_setup2',mode:'setup'}}};
  assert.equal((await handler(req())).status,200);
  assert.equal(rpcCalls.length,0,'an abandoned save-card page does nothing');
});

test('a paid order records its card fingerprint (from the charge, or the payment method as a fallback), and a card that cannot be checked is logged and told to the operator without failing the payment',async()=>{
  let event,intent;
  const rpcCalls=[],alerts=[];
  class Stripe {
    static createFetchHttpClient(){}
    static createSubtleCryptoProvider(){}
    webhooks={constructEventAsync:async()=>event};
    paymentIntents={retrieve:async()=>{if(intent instanceof Error) throw intent;return intent;}};
  }
  const client={
    rpc:async(name,args)=>{
      if(name==='notify_operator_alert'){alerts.push(args);return {error:null};}
      rpcCalls.push([name,args]);
      if(name==='finalize_checkout_session') return {data:'purchase-1',error:null};
      if(name==='record_payment_fingerprint') return {data:{blocked:false},error:null};
      return {error:null};
    },
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{buyer_id:'member-1'}})})})}),
  };
  const createHandler=await loadHandler('stripe-webhook',Stripe);
  const handler=createHandler({env:()=> 'test',createClient:()=>client});
  const req=()=>new Request('https://example.test',{method:'POST',headers:{'Stripe-Signature':'test'},body:'{}'});
  event={type:'checkout.session.completed',data:{object:{id:'cs_order',mode:'payment',payment_status:'paid',payment_intent:'pi_1'}}};
  const recorded=()=>rpcCalls.filter(c=>c[0]==='record_payment_fingerprint');
  const quiet=async fn=>{const original=console.error;console.error=()=>{};try{return await fn();}finally{console.error=original;}};

  intent={latest_charge:{payment_method_details:{type:'card',card:{fingerprint:'fp_from_charge'}}}};
  assert.equal((await handler(req())).status,200);
  assert.deepEqual(recorded().at(-1)[1],{p_user_id:'member-1',p_kind:'card',p_fingerprint:'fp_from_charge',p_purchase_id:'purchase-1'});

  rpcCalls.length=0;
  intent={latest_charge:{payment_method_details:{type:'link'}},payment_method:{card:{fingerprint:'fp_from_method'}}};
  assert.equal((await handler(req())).status,200);
  assert.equal(recorded()[0][1].p_fingerprint,'fp_from_method','falls back to the payment method');

  rpcCalls.length=0;
  intent={latest_charge:{payment_method_details:{type:'link'}}};
  assert.equal((await quiet(()=>handler(req()))).status,200);
  assert.equal(recorded().length,0,'nothing to record, and the payment still succeeds');

  intent=new Error('stripe down');
  assert.equal((await quiet(()=>handler(req()))).status,200);
  assert.match(alerts.at(-1).p_properties.summary,/could not be checked/);
});
