import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, writeFile, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const FN=name=>new URL('../supabase/functions/'+name+'/',import.meta.url);
let loadCounter=0;
// A copy of a function's files in a temp folder with only the Stripe import replaced, so the handler's own relative imports still resolve.
async function loadWithStripe(dir,stripeStub) {
  const out=await mkdtemp(join(tmpdir(),'tax-'+(loadCounter++)+'-'));
  for(const file of (await readdir(FN(dir))).filter(f=>f.endsWith('.js'))) {
    if(file==='handler.js') await writeFile(join(out,file),(await readFile(new URL(file,FN(dir)),'utf8')).replace("import Stripe from 'npm:stripe@17';",'const Stripe=globalThis.__StripeStub;'));
    else await copyFile(new URL(file,FN(dir)),join(out,file));
  }
  globalThis.__StripeStub=stripeStub;
  return import(pathToFileURL(join(out,'handler.js')).href+'?'+loadCounter);
}

const LISTING='11111111-1111-4111-8111-aaaaaaaaaaaa', CHECKOUT='33333333-3333-4333-8333-cccccccccccc';
const BUYER_ADDRESS={name:'Jamie Buyer',street1:'123 Main St',street2:'Apt 4',city:'Las Vegas',state:'NV',zip:'89101',country:'US'};
const req=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});

function harness({tax,customers=[],sessionError=null}) {
  const stripeCalls=[],customerCalls=[];
  const Stripe=class{
    static createFetchHttpClient(){}
    customers={
      list:async args=>{customerCalls.push(['list',args]);return {data:customers};},
      create:async args=>{customerCalls.push(['create',args]);return {id:'cus_new'};},
      update:async(id,args)=>{customerCalls.push(['update',id,args]);return {id};},
    };
    checkout={sessions:{create:async args=>{if(sessionError) throw sessionError;stripeCalls.push(args);return {id:'cs_1',url:'https://pay.example/cs_1'};}}};
  };
  const createClient=()=>({
    auth:{getUser:async()=>({data:{user:{id:'buyer-1',email:'buyer@example.test'}},error:null})},
    rpc:async name=>{
      if(name==='shipping_quote_inputs') return {data:{seller_id:'seller-1',status:'active',title:'Signed Ball',price_cents:12000,free_shipping:false,is_king:false,seller_shipping_address:{name:'Sam',street1:'1 Seller Way',city:'Austin',state:'TX',zip:'78701',country:'US'},parcel:{weight_oz:12,length_in:10,width_in:8,height_in:4}},error:null};
      if(name==='reserve_listing_checkout') return {data:{checkout_session_id:CHECKOUT,price_cents:12000,title:'Signed Ball',applied_credit_cents:0,free_shipping:false,seller_shipping_address:null,want_insurance:false},error:null};
      return {data:null,error:null};
    },
  });
  // a carrier that always returns one usable rate
  const fetchImpl=async()=>({json:async()=>({object_id:'shp_1',rates:[{object_id:'r1',provider:'USPS',servicelevel:{token:'usps_ground_advantage',name:'Ground Advantage'},amount:'6.40',included_insurance_price:'0.00',estimated_days:5}]})});
  const env=key=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',SHIPPO_API_KEY:'shippo',STRIPE_SECRET_KEY:'sk',APP_URL:'https://app.example',...(tax!==undefined?{STRIPE_TAX_ENABLED:tax}:{})}[key]);
  return {stripeCalls,customerCalls,build:async()=>{const {createHandler}=await loadWithStripe('create-checkout-session',Stripe);return createHandler({createClient,env,fetchImpl});}};
}

test('with the tax switch off, checkout is exactly what it was: no tax settings, no Stripe customer', async () => {
  const h=harness({}); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:BUYER_ADDRESS,want_insurance:false}));
  assert.equal(res.status,200);
  const call=h.stripeCalls[0];
  assert.equal(call.automatic_tax,undefined); assert.equal(call.customer,undefined); assert.equal(call.customer_email,'buyer@example.test');
  assert.deepEqual(call.line_items[0].price_data.product_data,{name:'Signed Ball'}); assert.equal(call.line_items[0].price_data.tax_behavior,undefined);
  assert.equal(h.customerCalls.length,0);
});

test('with tax on, a shipped order is taxed at the shipping address through a Stripe customer, and tax is added on top of the price', async () => {
  let h=harness({tax:'true'}); let handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:BUYER_ADDRESS,want_insurance:false}));
  assert.equal(res.status,200);
  const call=h.stripeCalls[0];
  assert.deepEqual(call.automatic_tax,{enabled:true});
  assert.equal(call.customer,'cus_new'); assert.equal(call.customer_email,undefined,'a customer and an email cannot both be sent');
  assert.equal(call.line_items[0].price_data.product_data.tax_code,'txcd_99999999');
  assert.equal(call.line_items[0].price_data.tax_behavior,'exclusive');
  const created=h.customerCalls.find(c=>c[0]==='create')[1];
  assert.deepEqual(created.shipping.address,{line1:'123 Main St',line2:'Apt 4',city:'Las Vegas',state:'NV',postal_code:'89101',country:'US'});
  assert.equal(created.metadata.user_id,'buyer-1');

  // a returning buyer's customer is reused and updated, not duplicated
  h=harness({tax:'true',customers:[{id:'cus_old'}]}); handler=await h.build();
  await handler(req({listing_id:LISTING,shipping_address:BUYER_ADDRESS,want_insurance:false}));
  assert.equal(h.stripeCalls[0].customer,'cus_old');
  assert.ok(h.customerCalls.some(c=>c[0]==='update' && c[1]==='cus_old')); assert.ok(!h.customerCalls.some(c=>c[0]==='create'));
});

test('with tax on, a pickup order has no shipping address, so Stripe asks for a billing address and taxes there', async () => {
  const h=harness({tax:'true'}); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,fulfillment_method:'pickup',shipping_address:null}));
  assert.equal(res.status,200);
  const call=h.stripeCalls[0];
  assert.deepEqual(call.automatic_tax,{enabled:true}); assert.equal(call.billing_address_collection,'required');
  assert.equal(call.customer,undefined); assert.equal(call.customer_email,'buyer@example.test');
  assert.equal(h.customerCalls.length,0);
});

test('with tax on, an address Stripe cannot tax gets a clear message, not a crash', async () => {
  const error=Object.assign(new Error('bad location'),{code:'customer_tax_location_invalid'});
  const h=harness({tax:'true',sessionError:error}); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:BUYER_ADDRESS,want_insurance:false}));
  assert.equal(res.status,400);
  assert.match((await res.json()).error,/work out sales tax for that address/);
});

// --- the webhook records the tax --------------------------------------------------------------------------------------------
async function webhookHandler(Stripe,client) {
  const source=await readFile(new URL('handler.js',FN('stripe-webhook')),'utf8');
  const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');
  return load(Stripe)({env:()=> 'test',createClient:()=>client});
}

test('the webhook remembers the tax an order carried, and skips it when there was none', async () => {
  let event; const rpcCalls=[];
  class Stripe { static createFetchHttpClient(){} static createSubtleCryptoProvider(){} webhooks={constructEventAsync:async()=>event}; paymentIntents={retrieve:async()=>({latest_charge:{payment_method_details:{card:{fingerprint:null}}}})}; }
  const client={rpc:async(name,args)=>{rpcCalls.push([name,args]);return name==='finalize_checkout_session'?{data:'purchase-1',error:null}:{error:null};},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})};
  const handler=await webhookHandler(Stripe,client);
  const post=()=>handler(new Request('https://example.test',{method:'POST',headers:{'Stripe-Signature':'t'},body:'{}'}));

  event={type:'checkout.session.completed',data:{object:{id:'cs_1',mode:'payment',payment_status:'paid',payment_intent:'pi_1',amount_total:13029,total_details:{amount_tax:1029}}}};
  assert.equal((await post()).status,200);
  assert.deepEqual(rpcCalls.find(c=>c[0]==='record_purchase_tax')[1],{p_purchase_id:'purchase-1',p_tax_cents:1029,p_charged_cents:13029});

  rpcCalls.length=0;
  event={type:'checkout.session.completed',data:{object:{id:'cs_2',mode:'payment',payment_status:'paid',payment_intent:'pi_2',amount_total:12000,total_details:{amount_tax:0}}}};
  assert.equal((await post()).status,200);
  assert.ok(!rpcCalls.some(c=>c[0]==='record_purchase_tax'),'no tax, nothing to record');
});

// --- refunds give the tax back ----------------------------------------------------------------------------------------------
test('a partial refund returns the matching share of the tax; the seller reversal stays the price portion; a full refund is untouched', async () => {
  const source=await readFile(new URL('handler.js',FN('process-refund')),'utf8');
  const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');
  const refunds=[],reversals=[];
  class Stripe { static createFetchHttpClient(){} refunds={create:async a=>{refunds.push(a);return {id:'re_1'};}}; transfers={createReversal:async (transfer,a)=>{reversals.push({transfer,...(a||{})});return {};}}; }
  const REQUEST='44444444-4444-4444-8444-dddddddddddd';
  const build=(offered,purchase)=>{
    const chain=data=>{const b={select:()=>b,eq:()=>b,maybeSingle:async()=>({data,error:null})};return b;};
    const client={auth:{getUser:async()=>({data:{user:{id:'seller-1'}}})},rpc:async()=>({error:null}),
      from:t=>t==='refund_requests'?chain({id:REQUEST,purchase_id:'p1',seller_id:'seller-1',buyer_id:'buyer-1',status:'accepted',offered_amount_cents:offered}):chain({id:'p1',stripe_payment_intent_id:'pi_1',escrow_status:'released',stripe_transfer_id:'tr_1',...purchase})};
    return load(Stripe)({env:()=> 'test',createClient:()=>client});
  };
  const post=handler=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify({refund_request_id:REQUEST})}));

  // $100 item + $10.29 tax charged = $110.29; a $50 partial refund returns $50 + half the tax
  assert.equal((await post(build(5000,{tax_cents:1029,charged_cents:11029}))).status,200);
  assert.equal(refunds[0].amount,5000+Math.round(1029*5000/(11029-1029)));
  assert.equal(reversals[0].amount,5000,'the seller never received the tax, so only the price portion is reversed');

  // a full refund sends no amount: Stripe returns the whole payment, tax included
  refunds.length=0;
  assert.equal((await post(build(null,{tax_cents:1029,charged_cents:11029}))).status,200);
  assert.equal(refunds[0].amount,undefined);

  // an order with no tax refunds exactly the offered amount, as before
  refunds.length=0;
  assert.equal((await post(build(5000,{tax_cents:0,charged_cents:null}))).status,200);
  assert.equal(refunds[0].amount,5000);
});

// --- the database function ----------------------------------------------------------------------------------------------------
import {PGlite} from '@electric-sql/pglite';
test('record_purchase_tax is server-only, stores the tax and total, and refuses nonsense', async () => {
  const db=new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role;create table public.purchases(id uuid primary key);insert into public.purchases(id) values('44444444-4444-4444-8444-dddddddddddd');grant usage on schema public to anon,authenticated,service_role;");
    await db.exec(await readFile(new URL('../supabase/migrations/202610050108_sales_tax_on_purchases.sql',import.meta.url),'utf8'));
    const id='44444444-4444-4444-8444-dddddddddddd';
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.record_purchase_tax($1,100,1100)',[id]),/permission denied/);
    await db.exec('reset role;set role service_role');
    await db.query('select public.record_purchase_tax($1,1029,11029)',[id]);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select tax_cents::int as t,charged_cents::int as c from public.purchases where id=$1',[id])).rows[0],{t:1029,c:11029});
    await db.exec('set role service_role');
    await assert.rejects(db.query('select public.record_purchase_tax($1,-1,100)',[id]),/Invalid tax amount/);
    await assert.rejects(db.query('select public.record_purchase_tax($1,500,100)',[id]),/Invalid charged amount/);
    await assert.rejects(db.query("select public.record_purchase_tax('55555555-5555-4555-8555-555555555555',0,100)"),/Purchase not found/);
  } finally { await db.close(); }
});
