import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, writeFile, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const FN=name=>new URL('../supabase/functions/'+name+'/',import.meta.url);
const sourceOf=async(dir,file)=>readFile(new URL(file,FN(dir)),'utf8');
const rates=await import(new URL('shippingRates.js',FN('create-checkout-session')));
const {normalizeRates,buyerPrice,findChoice,maxLabelCents,normalizeRate}=rates;

// A copy of a function's files in a temp folder with only the Stripe import replaced, so the handler's own relative imports still resolve.
let loadCounter=0;
async function loadWithStripe(dir,stripeStub) {
  const out=await mkdtemp(join(tmpdir(),'fn-'+(loadCounter++)+'-'));
  for(const file of (await readdir(FN(dir))).filter(f=>f.endsWith('.js'))) {
    if(file==='handler.js') await writeFile(join(out,file),(await sourceOf(dir,file)).replace("import Stripe from 'npm:stripe@17';",'const Stripe=globalThis.__StripeStub;'));
    else await copyFile(new URL(file,FN(dir)),join(out,file));
  }
  globalThis.__StripeStub=stripeStub;
  return import(pathToFileURL(join(out,'handler.js')).href+'?'+loadCounter);
}

// --- fake Shippo -------------------------------------------------------------------------------------------------------------
const RATE=(id,provider,token,name,amount,days,insurance='0.00')=>({object_id:id,provider,servicelevel:{token,name},amount,included_insurance_price:insurance,estimated_days:days});
const GROUND=RATE('r_ground','USPS','usps_ground_advantage','Ground Advantage','6.40',5);
const PRIORITY=RATE('r_priority','USPS','usps_priority','Priority Mail','9.80',2);
const OVERNIGHT=RATE('r_overnight','UPS','ups_next_day_air','Next Day Air','44.00',1);
function fakeShippo({rates=[GROUND,PRIORITY,OVERNIGHT],toZip='62704'}={}) {
  const calls=[];
  const shipment={object_id:'shp_1',address_to:{zip:toZip},rates};
  const fetchImpl=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
    const json=data=>({json:async()=>data});
    if(url.endsWith('/shipments/') && options.method==='POST') return json(shipment);
    if(url.includes('/rates/')) { const id=decodeURIComponent(url.split('/rates/')[1]); const rate=rates.find(r=>r.object_id===id); return json(rate?{...rate,shipment:'shp_1'}:{}); }
    if(url.includes('/shipments/')) return json(shipment);
    if(url.endsWith('/transactions/')) return json({status:'SUCCESS',object_id:'tx_1',tracking_number:'TRACK',tracking_url_provider:'https://t',label_url:'https://l'});
    throw new Error('unexpected Shippo call '+url);
  };
  return {fetchImpl,calls};
}

const SELLER_ADDRESS={name:'Sam Seller',street1:'1 Seller Way',city:'Austin',state:'TX',zip:'78701',country:'US'};
const BUYER_ADDRESS={name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};
const PARCEL={weight_oz:12,length_in:10,width_in:8,height_in:4};
const LISTING='11111111-1111-4111-8111-aaaaaaaaaaaa', PURCHASE='22222222-2222-4222-8222-bbbbbbbbbbbb', CHECKOUT='33333333-3333-4333-8333-cccccccccccc';
const req=(body,auth='Bearer t')=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:auth}:{},body:JSON.stringify(body)});

test('shipping helpers: one option per service, cheapest first, buyer prices carry the markup, the label ceiling allows small drift only', () => {
  const dup=RATE('r_ground2','USPS','usps_ground_advantage','Ground Advantage','7.10',5);
  const options=normalizeRates([OVERNIGHT,dup,PRIORITY,GROUND,{object_id:'x',provider:'USPS',servicelevel:{token:'t'}}]);
  assert.deepEqual(options.map(o=>o.service),['usps_ground_advantage','usps_priority','ups_next_day_air']);
  assert.equal(options[0].amount_cents,640,'the cheapest of two quotes for one service is kept');
  assert.deepEqual(buyerPrice({amount_cents:1000,insurance_cents:200},1.10),{shipping_cents:880,insurance_cents:220});
  assert.deepEqual(buyerPrice({amount_cents:1000,insurance_cents:200},1),{shipping_cents:800,insurance_cents:200});
  assert.equal(findChoice(options,{provider:'usps',service:'usps_priority'}).rate_id,'r_priority');
  assert.equal(findChoice(options,{provider:'USPS',service:'nope'}),null);
  assert.equal(findChoice(options,null),null);
  assert.equal(maxLabelCents(640),940,'a small quote may drift by up to $3');
  assert.equal(maxLabelCents(4000),5000,'a large quote may drift by up to 25%');
  assert.equal(normalizeRate(PRIORITY).amount_cents,980);
});

test('the shipping helper and markup are identical in every function that carries a copy', async () => {
  const reference=await sourceOf('create-checkout-session','shippingRates.js');
  for(const dir of ['checkout-shipping-options','shippo-get-rates','shippo-buy-label']) assert.equal(await sourceOf(dir,'shippingRates.js'),reference,dir+' has a drifted copy of shippingRates.js');
  assert.equal(await sourceOf('checkout-shipping-options','markup.js'),await sourceOf('create-checkout-session','markup.js'));
});

function optionsClient({inputs,user='buyer-1'}) {
  return {createClient:(url,key)=>({
    auth:{getUser:async()=>({data:{user:{id:user,email:'buyer@example.test'}},error:null})},
    rpc:async(name)=>name==='shipping_quote_inputs'?{data:inputs,error:null}:{data:null,error:null},
  }),env:key=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',SHIPPO_API_KEY:'shippo'}[key])};
}
const INPUTS={seller_id:'seller-1',status:'active',title:'Signed Ball',price_cents:12000,free_shipping:false,is_king:false,seller_shipping_address:SELLER_ADDRESS,parcel:PARCEL};

test('checkout-shipping-options lists the services with buyer prices, never reveals the seller address, and respects free shipping and King\'s Collection', async () => {
  const {createHandler}=await import(new URL('handler.js',FN('checkout-shipping-options')));
  const run=async(inputs,extra={})=>{
    const shippo=fakeShippo();
    const handler=createHandler({...optionsClient({inputs,...extra}),fetchImpl:shippo.fetchImpl});
    const res=await handler(req({listing_id:LISTING,shipping_address:BUYER_ADDRESS,want_insurance:false}));
    return {res,body:await res.json(),shippo};
  };

  let {res,body,shippo}=await run(INPUTS);
  assert.equal(res.status,200);
  assert.deepEqual(body.options.map(o=>[o.service,o.shipping_cents]),[['usps_ground_advantage',704],['usps_priority',1078],['ups_next_day_air',4840]]);
  assert.equal(body.locked,false);
  assert.ok(!JSON.stringify(body).includes('Seller Way'),'the seller address is never sent to the buyer');
  assert.equal(shippo.calls[0].body.address_from.street1,'1 Seller Way','but it is used to ask the carrier');

  ({body}=await run({...INPUTS,is_king:true}));
  assert.deepEqual(body.options.map(o=>o.shipping_cents),[640,980,4400],'King\'s Collection shipping is passed through at the carrier rate');

  ({body}=await run({...INPUTS,free_shipping:true}));
  assert.equal(body.options.length,1,'free shipping is not a choice');
  assert.deepEqual([body.options[0].service,body.options[0].shipping_cents,body.locked,body.free_shipping],['usps_ground_advantage',0,true,true]);

  ({res,body}=await run(INPUTS,{user:'seller-1'}));
  assert.equal(res.status,400);
  ({body}=await run({...INPUTS,parcel:null}));
  assert.deepEqual(body.options,[],'a listing with no package size has no options');
  ({res}=await run({...INPUTS,status:'sold'}));
  assert.equal(res.status,400);
});

function checkoutHarness({inputs=INPUTS,rateSet,reserveFreeShipping=false}={}) {
  const rpcCalls=[],stripeCalls=[];
  const shippo=fakeShippo(rateSet?{rates:rateSet}:{});
  const Stripe=class{
    static createFetchHttpClient(){}
    checkout={sessions:{create:async args=>{stripeCalls.push(args);return {id:'cs_1',url:'https://pay.example/cs_1'};}}};
  };
  const createClient=()=>({
    auth:{getUser:async()=>({data:{user:{id:'buyer-1',email:'buyer@example.test'}},error:null})},
    rpc:async(name,args)=>{
      rpcCalls.push([name,args]);
      if(name==='shipping_quote_inputs') return {data:inputs,error:null};
      if(name==='listing_is_king_collection') return {data:inputs.is_king,error:null};
      if(name==='reserve_listing_checkout') return {data:{checkout_session_id:CHECKOUT,price_cents:inputs.price_cents,title:inputs.title,applied_credit_cents:0,free_shipping:reserveFreeShipping||inputs.free_shipping,seller_shipping_address:inputs.seller_shipping_address,want_insurance:false,parcel:inputs.parcel},error:null};
      return {data:null,error:null};
    },
  });
  const env=key=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',SHIPPO_API_KEY:'shippo',STRIPE_SECRET_KEY:'sk',APP_URL:'https://app.example'}[key]);
  return {rpcCalls,stripeCalls,shippo,build:async()=>{const {createHandler}=await loadWithStripe('create-checkout-session',Stripe);return createHandler({createClient,env,fetchImpl:shippo.fetchImpl});}};
}
const checkoutBody=extra=>({listing_id:LISTING,shipping_address:BUYER_ADDRESS,want_insurance:false,...extra});

test('create-checkout-session charges the service the buyer picked, records it, and refuses an unavailable pick before reserving the item', async () => {
  let h=checkoutHarness();
  let handler=await h.build();
  let res=await handler(req(checkoutBody({shipping_choice:{provider:'USPS',service:'usps_priority'}})));
  assert.equal(res.status,200);
  const lines=h.stripeCalls[0].line_items.map(l=>[l.price_data.product_data.name,l.price_data.unit_amount]);
  assert.deepEqual(lines,[['Signed Ball',12000],['Shipping',1078]],'the buyer pays for Priority, marked up 10%, not for the cheapest');
  const attach=h.rpcCalls.find(c=>c[0]==='attach_shipping_service');
  assert.deepEqual(attach[1],{p_checkout_session_id:CHECKOUT,p_provider:'USPS',p_service:'usps_priority',p_service_name:'Priority Mail',p_quote_cents:980});
  const stripeAttach=h.rpcCalls.find(c=>c[0]==='attach_stripe_checkout_session');
  assert.equal(stripeAttach[1].p_shipping_cost_cents,1078);

  // no pick: the cheapest, as before
  h=checkoutHarness(); handler=await h.build();
  await handler(req(checkoutBody({})));
  assert.deepEqual(h.stripeCalls[0].line_items.map(l=>l.price_data.unit_amount),[12000,704]);
  assert.equal(h.rpcCalls.find(c=>c[0]==='attach_shipping_service')[1].p_service,'usps_ground_advantage');

  // a pick that is not offered any more is refused WITHOUT reserving the item
  h=checkoutHarness(); handler=await h.build();
  res=await handler(req(checkoutBody({shipping_choice:{provider:'FedEx',service:'fedex_overnight'}})));
  assert.equal(res.status,409);
  assert.ok(!h.rpcCalls.some(c=>c[0]==='reserve_listing_checkout'),'nothing was reserved');
  assert.equal(h.stripeCalls.length,0);

  // free shipping: the seller pays for the cheapest, whatever the browser asked for, and no shipping line is charged to the buyer
  h=checkoutHarness({inputs:{...INPUTS,free_shipping:true}}); handler=await h.build();
  res=await handler(req(checkoutBody({shipping_choice:{provider:'UPS',service:'ups_next_day_air'}})));
  assert.equal(res.status,200);
  assert.deepEqual(h.stripeCalls[0].line_items.map(l=>l.price_data.unit_amount),[12000]);
  assert.equal(h.rpcCalls.find(c=>c[0]==='attach_stripe_checkout_session')[1].p_shipping_cost_cents,704,'the cheapest cost is still recorded (it comes out of the seller payout)');
  assert.equal(h.rpcCalls.find(c=>c[0]==='attach_shipping_service')[1].p_service,'usps_ground_advantage');

  // pickup never touches Shippo
  h=checkoutHarness(); handler=await h.build();
  await handler(req({listing_id:LISTING,fulfillment_method:'pickup',shipping_address:null}));
  assert.equal(h.shippo.calls.length,0);
});

// --- seller side ------------------------------------------------------------------------------------------------------------
function chain(result) {
  const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:result,error:null}),single:async()=>({data:result,error:null})};
  return builder;
}
// the seller-scoped and service-role clients are two different createClient calls; tell them apart by the key they are given
function sellerEnv() {
  const calls=[];
  return {calls,env:key=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',SHIPPO_API_KEY:'shippo'}[key])};
}
function labelClients({order}) {
  const rpcCalls=[];
  const sale={id:PURCHASE,shipped_at:null,label_url:null,tracking_number:null,tracking_url:null,shipping_address:BUYER_ADDRESS,listing_id:LISTING,insured:false,insured_value_cents:0,listings:PARCEL};
  const createClient=(url,key,options)=>{
    const asService=key==='s';
    return {
      auth:{getUser:async()=>({data:{user:{id:'seller-1',email:'seller@example.test'}},error:null})},
      rpc:async(name,args)=>{rpcCalls.push([name,args]);return {error:null};},
      from:table=>{
        if(table==='profiles') return chain({shipping_address:SELLER_ADDRESS});
        if(table==='purchases') return chain(asService ? {...order,shipping_address:BUYER_ADDRESS} : sale);
        throw new Error('unexpected table '+table);
      },
    };
  };
  return {rpcCalls,createClient,env:sellerEnv().env};
}

test('shippo-get-rates offers the seller only the service the buyer chose (or only the cheapest for an older order), and pauses a price blow-out', async () => {
  const {createHandler}=await import(new URL('handler.js',FN('shippo-get-rates')));
  const run=async(order,rateSet)=>{
    const shippo=fakeShippo(rateSet?{rates:rateSet}:{});
    const clients=labelClients({order});
    const handler=createHandler({createClient:clients.createClient,env:clients.env,fetchImpl:shippo.fetchImpl});
    const res=await handler(req({purchase_id:PURCHASE}));
    return {res,body:await res.json(),clients};
  };

  let {res,body}=await run({shipping_provider:'USPS',shipping_service:'usps_priority',shipping_quote_cents:980});
  assert.equal(res.status,200);
  assert.deepEqual(body.rates.map(r=>[r.provider,r.servicelevel,r.amount_cents]),[['USPS','Priority Mail',980]],'a single option, the one the buyer paid for');
  assert.equal(body.locked,true); assert.equal(body.buyer_chose,true);

  ({res,body}=await run({shipping_provider:null,shipping_service:null,shipping_quote_cents:null}));
  assert.deepEqual(body.rates.map(r=>r.servicelevel),['Ground Advantage'],'an order with no recorded choice gets only the cheapest');
  assert.equal(body.buyer_chose,false);

  // the buyer's service is no longer offered by the carrier
  ({res,body}=await run({shipping_provider:'FedEx',shipping_service:'fedex_overnight',shipping_quote_cents:900}));
  assert.equal(res.status,409);

  // the carrier price jumped far above the checkout quote: the label is paused and the operator is told
  let clients;
  ({res,body,clients}=await run({shipping_provider:'UPS',shipping_service:'ups_next_day_air',shipping_quote_cents:900}));
  assert.equal(res.status,409);
  assert.ok(clients.rpcCalls.some(c=>c[0]==='notify_operator_alert' && c[1].p_event==='Admin Alert: Payment Problem'));
});

test('shippo-buy-label buys only the service the buyer chose and never a rate from another order', async () => {
  const {createHandler}=await import(new URL('handler.js',FN('shippo-buy-label')));
  const run=async(order,rateId,{rateSet,toZip}={})=>{
    const shippo=fakeShippo({...(rateSet?{rates:rateSet}:{}),...(toZip?{toZip}:{})});
    const clients=labelClients({order});
    const handler=createHandler({createClient:clients.createClient,env:clients.env,fetchImpl:shippo.fetchImpl});
    const res=await handler(req({purchase_id:PURCHASE,rate_id:rateId}));
    return {res,body:await res.json(),shippo,clients};
  };
  const chosen={shipping_provider:'USPS',shipping_service:'usps_priority',shipping_quote_cents:980};

  let out=await run(chosen,'r_priority');
  assert.equal(out.res.status,200);
  assert.ok(out.shippo.calls.some(c=>c.url.endsWith('/transactions/')),'the label was bought');
  const record=out.clients.rpcCalls.find(c=>c[0]==='record_shipment');
  assert.equal(record[1].p_seller_id,'seller-1');

  // a different (more expensive) service than the buyer paid for: refused, and Shippo is never asked to buy
  out=await run(chosen,'r_overnight');
  assert.equal(out.res.status,403);
  assert.ok(!out.shippo.calls.some(c=>c.url.endsWith('/transactions/')),'no label was bought');
  // a made-up rate id
  out=await run(chosen,'r_nonexistent');
  assert.equal(out.res.status,400);
  // a rate that belongs to a shipment going somewhere else
  out=await run(chosen,'r_priority',{toZip:'90210'});
  assert.equal(out.res.status,400);
  assert.ok(!out.shippo.calls.some(c=>c.url.endsWith('/transactions/')));
  // the right service but the carrier price has jumped far above the quote
  out=await run({...chosen,shipping_quote_cents:300},'r_priority');
  assert.equal(out.res.status,409);

  // an older order with no recorded choice: only the cheapest service
  const legacy={shipping_provider:null,shipping_service:null,shipping_quote_cents:null};
  out=await run(legacy,'r_ground');
  assert.equal(out.res.status,200);
  out=await run(legacy,'r_priority');
  assert.equal(out.res.status,403);
});

test('free-shipping orders: the seller picks any service, the real price is charged to their payout, and a label bigger than the payout is refused', async () => {
  const rates=await import(new URL('handler.js',FN('shippo-get-rates')));
  const labels=await import(new URL('handler.js',FN('shippo-buy-label')));
  // price $12.00, platform fee $1.90 -> $10.10 payout before shipping
  const order={seller_pays_shipping:true,price_cents:1200,platform_fee_cents:190,shipping_provider:'USPS',shipping_service:'usps_ground_advantage',shipping_quote_cents:640};

  let shippo=fakeShippo(), clients=labelClients({order});
  let res=await rates.createHandler({createClient:clients.createClient,env:clients.env,fetchImpl:shippo.fetchImpl})(req({purchase_id:PURCHASE}));
  let body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.seller_pays,true); assert.equal(body.locked,false);
  assert.deepEqual(body.rates.map(r=>[r.servicelevel,r.amount_cents,r.affordable]),[['Ground Advantage',640,true],['Priority Mail',980,true],['Next Day Air',4400,false]],'every service, with what it costs the seller and whether the payout covers it');

  const buy=async rateId=>{
    shippo=fakeShippo(); clients=labelClients({order});
    const out=await labels.createHandler({createClient:clients.createClient,env:clients.env,fetchImpl:shippo.fetchImpl})(req({purchase_id:PURCHASE,rate_id:rateId}));
    return {res:out,body:await out.json()};
  };
  // a more expensive service than the cheapest is fine here, because the seller pays for it
  let out=await buy('r_priority');
  assert.equal(out.res.status,200);
  const charge=clients.rpcCalls.find(c=>c[0]==='set_seller_shipping_charge');
  assert.equal(charge[1].p_charge_cents,980); assert.equal(charge[1].p_seller_id,'seller-1');
  // more than the payout from the sale: refused before any label is bought
  out=await buy('r_overnight');
  assert.equal(out.res.status,409);
  assert.ok(!shippo.calls.some(c=>c.url.endsWith('/transactions/')),'no label was bought');
  assert.ok(!clients.rpcCalls.some(c=>c[0]==='set_seller_shipping_charge'));
});

test('a shipped order cannot be bought without a real shipping quote, so a buyer is never charged $0 for delivery; pickup is unaffected', async () => {
  const buy=async({inputs=INPUTS,rateSet,key=true,unreachable=false,pickup=false}={})=>{
    const h=checkoutHarness({inputs,rateSet});
    const handler=await h.build();
    if(unreachable) { const {createHandler}=await loadWithStripe('create-checkout-session',class{static createFetchHttpClient(){}checkout={sessions:{create:async()=>({id:'cs',url:'u'})}}}); const throwing=createHandler({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'buyer-1',email:'b@example.test'}},error:null})},rpc:async name=>name==='shipping_quote_inputs'?{data:INPUTS,error:null}:{data:null,error:null}}),env:k=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',SHIPPO_API_KEY:'shippo',STRIPE_SECRET_KEY:'sk',APP_URL:'x'}[k]),fetchImpl:async()=>{throw new Error('down');}}); const res=await throwing(req(checkoutBody({}))); return {res,h}; }
    const res=await handler(req(pickup?{listing_id:LISTING,fulfillment_method:'pickup',shipping_address:null}:checkoutBody({})));
    return {res,h};
  };
  // carriers return nothing (a package too small, or an address they cannot reach): refused, nothing reserved, nothing charged
  let {res,h}=await buy({rateSet:[]});
  assert.equal(res.status,409); assert.match((await res.json()).error,/No shipping service is available/);
  assert.ok(!h.rpcCalls.some(c=>c[0]==='reserve_listing_checkout')); assert.equal(h.stripeCalls.length,0);
  // the carrier is unreachable: try again later, nothing reserved
  ({res}=await buy({unreachable:true}));
  assert.equal(res.status,503); assert.match((await res.json()).error,/temporarily unavailable/);
  // no package size / no seller address on file
  ({res,h}=await buy({inputs:{...INPUTS,parcel:null}}));
  assert.equal(res.status,409); assert.match((await res.json()).error,/package size or shipping address/);
  assert.ok(!h.rpcCalls.some(c=>c[0]==='reserve_listing_checkout'));
  ({res}=await buy({inputs:{...INPUTS,seller_shipping_address:null}}));
  assert.equal(res.status,409);
  // pickup needs no shipping quote at all
  ({res,h}=await buy({pickup:true}));
  assert.equal(res.status,200); assert.equal(h.shippo.calls.length,0);
  // and a normal quote still goes through
  ({res}=await buy({}));
  assert.equal(res.status,200);
});

// --- the smallest package the carriers accept --------------------------------------------------------------------------------
import {PGlite} from '@electric-sql/pglite';
import {packageTooSmall, listingInput} from '../src/domain.js';
test('a package smaller than the carriers accept is refused by the listing form and by the database, in any order of the sides; existing listings are left alone', async () => {
  assert.equal(packageTooSmall(1,1,1),true);
  assert.equal(packageTooSmall(6,3,0.25),false,'exactly the minimum is fine');
  assert.equal(packageTooSmall(3,6,0.25),false,'the order of the sides does not matter');
  assert.equal(packageTooSmall(5.9,3,1),true); assert.equal(packageTooSmall(6,2.9,1),true); assert.equal(packageTooSmall(6,3,0.2),true);
  const base={title:'Signed ball',description:'A fictional description for testing.',category:'Sports',price_cents:5000};
  assert.throws(()=>listingInput({...base,weight_oz:8,length_in:1,width_in:1,height_in:1}),/smaller than the carriers accept/);
  assert.ok(listingInput({...base,weight_oz:8,length_in:8,width_in:6,height_in:4}).length_in===8);

  const db=new PGlite();
  try {
    await db.exec('create table public.listings(id serial primary key,length_in numeric,width_in numeric,height_in numeric,title text)');
    await db.exec("insert into public.listings(length_in,width_in,height_in,title) values(1,1,1,'old tiny listing')");
    await db.exec(await readFile(new URL('../supabase/migrations/202610050109_minimum_package_size.sql',import.meta.url),'utf8'));
    await db.exec("update public.listings set title='edited' where id=1"); // an old listing can still be edited
    await assert.rejects(db.exec('insert into public.listings(length_in,width_in,height_in) values(1,1,1)'),/smaller than the carriers accept/);
    await assert.rejects(db.exec('update public.listings set length_in=5 where id=1'),/smaller than the carriers accept/);
    await db.exec('insert into public.listings(length_in,width_in,height_in) values(3,6,0.25),(8,6,4)');
    await db.exec('insert into public.listings(title) values(\'no package size yet\')');
  } finally { await db.close(); }
});
