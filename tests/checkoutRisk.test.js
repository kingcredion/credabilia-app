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
  const out=await mkdtemp(join(tmpdir(),'risk-'+(loadCounter++)+'-'));
  for(const file of (await readdir(FN(dir))).filter(f=>f.endsWith('.js'))) {
    if(file==='handler.js') await writeFile(join(out,file),(await readFile(new URL(file,FN(dir)),'utf8')).replace("import Stripe from 'npm:stripe@17';",'const Stripe=globalThis.__StripeStub;'));
    else await copyFile(new URL(file,FN(dir)),join(out,file));
  }
  globalThis.__StripeStub=stripeStub;
  return import(pathToFileURL(join(out,'handler.js')).href+'?'+loadCounter);
}

const LISTING='11111111-1111-4111-8111-aaaaaaaaaaaa', CHECKOUT='33333333-3333-4333-8333-cccccccccccc';
const ADDRESS={name:'Jamie Buyer',street1:'123 Main St',city:'Las Vegas',state:'NV',zip:'89101',country:'US'};
const req=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});
const PROFILE={price_cents:12000,certificate_state:'none',signed:false,seller_tier:'new',prior_purchases:0,flags:['no_certificate','new_seller'],level:'elevated',
  requires_disclosure:true,disclosure_version:'cert-2026-10-08',signature_required:false,require_3ds:false};
const TAGS={order_ref:CHECKOUT,listing_id:LISTING,risk_level:'elevated',risk_flags:'no_certificate,new_seller',certificate_state:'none',disclosure_acknowledged:'true'};

function harness({profile=PROFILE,profileFails=false,price=12000,noSignatureRates=false}={}) {
  const stripeCalls=[],rpcCalls=[],shippoBodies=[];
  const Stripe=class{
    static createFetchHttpClient(){}
    checkout={sessions:{create:async args=>{stripeCalls.push(args);return {id:'cs_1',url:'https://pay.example/cs_1'};}}};
  };
  const createClient=()=>({
    auth:{getUser:async()=>({data:{user:{id:'buyer-1',email:'buyer@example.test'}},error:null})},
    rpc:async(name,args)=>{
      rpcCalls.push([name,args]);
      if(name==='shipping_quote_inputs') return {data:{seller_id:'seller-1',status:'active',title:'Signed Ball',price_cents:price,free_shipping:false,is_king:false,seller_shipping_address:{name:'Sam',street1:'1 Seller Way',city:'Austin',state:'TX',zip:'78701',country:'US'},parcel:{weight_oz:12,length_in:10,width_in:8,height_in:4}},error:null};
      if(name==='reserve_listing_checkout') return {data:{checkout_session_id:CHECKOUT,price_cents:price,title:'Signed Ball',applied_credit_cents:0,free_shipping:false,seller_shipping_address:null,want_insurance:false},error:null};
      if(name==='checkout_risk_profile') { if(profileFails) throw new Error('database down'); return {data:profile,error:null}; }
      if(name==='checkout_stripe_tags') return {data:TAGS,error:null};
      return {data:null,error:null};
    },
  });
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);shippoBodies.push(body);
    const withSignature=!!body.extra?.signature_confirmation;
    return {json:async()=>({object_id:'shp_1',rates:(noSignatureRates && withSignature)?[]:[{object_id:'r1',provider:'USPS',servicelevel:{token:'usps_ground_advantage',name:'Ground Advantage'},amount:withSignature?'9.10':'6.40',included_insurance_price:'0.00',estimated_days:5}]})};
  };
  const env=key=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',SHIPPO_API_KEY:'shippo',STRIPE_SECRET_KEY:'sk',APP_URL:'https://app.example'}[key]);
  return {stripeCalls,rpcCalls,shippoBodies,build:async()=>{const {createHandler}=await loadWithStripe('create-checkout-session',Stripe);return createHandler({createClient,env,fetchImpl});}};
}

test('a confirmed notice is recorded, and Stripe receives the risk tags on the payment', async () => {
  const h=harness(); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:true}));
  assert.equal(res.status,200);
  const record=h.rpcCalls.find(c=>c[0]==='record_checkout_risk')[1];
  assert.equal(record.p_acknowledged,true);
  assert.equal(record.p_checkout_session_id,CHECKOUT);
  const call=h.stripeCalls[0];
  assert.deepEqual(call.metadata,TAGS);
  assert.deepEqual(call.payment_intent_data.metadata,TAGS);
  assert.match(call.payment_intent_data.description,/Credabilia order/);
  assert.equal(call.payment_method_options,undefined,'ordinary orders do not force 3D Secure');
});

test('a buyer who has not confirmed the notice cannot pay for an item that needs one; nothing is reserved', async () => {
  const h=harness(); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:false}));
  assert.equal(res.status,400);
  const body=await res.json();
  assert.equal(body.needs_disclosure,true);
  assert.equal(h.rpcCalls.some(c=>c[0]==='reserve_listing_checkout'),false);
  assert.equal(h.stripeCalls.length,0);
});

test('an app that predates the notice still checks out, and the order is recorded as not confirmed', async () => {
  const h=harness(); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false}));
  assert.equal(res.status,200);
  assert.equal(h.rpcCalls.find(c=>c[0]==='record_checkout_risk')[1].p_acknowledged,false);
});

test('an item that needs no notice goes through even if the field says false', async () => {
  const h=harness({profile:{...PROFILE,requires_disclosure:false}}); const handler=await h.build();
  assert.equal((await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:false}))).status,200);
});

test('if the risk check itself fails, the purchase still goes through without tags', async () => {
  const h=harness({profileFails:true}); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:false}));
  assert.equal(res.status,200);
  const call=h.stripeCalls[0];
  assert.equal(call.metadata,undefined); assert.equal(call.payment_intent_data,undefined);
  assert.equal(h.rpcCalls.some(c=>c[0]==='record_checkout_risk'),false);
});

test('an expensive or high-risk order asks for 3D Secure and a delivery signature', async () => {
  const h=harness({price:60000,profile:{...PROFILE,level:'high',price_cents:60000,signature_required:true,require_3ds:true}}); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:true}));
  assert.equal(res.status,200);
  assert.deepEqual(h.stripeCalls[0].payment_method_options,{card:{request_three_d_secure:'any'}});
  assert.equal(h.shippoBodies[0].extra.signature_confirmation,'STANDARD');
  assert.equal(h.stripeCalls[0].line_items.some(item=>item.price_data.unit_amount===1001),true,'the buyer is quoted the signature rate with the marketplace markup');
});

test('below the signature threshold the carrier quote is unchanged', async () => {
  const h=harness({price:49999}); const handler=await h.build();
  assert.equal((await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:true}))).status,200);
  assert.equal(h.shippoBodies[0].extra,undefined);
});

test('if no carrier offers a signature for the parcel, the buyer still gets a normal quote', async () => {
  const h=harness({price:60000,noSignatureRates:true,profile:{...PROFILE,signature_required:true,require_3ds:true}}); const handler=await h.build();
  const res=await handler(req({listing_id:LISTING,shipping_address:ADDRESS,want_insurance:false,disclosure_ack:true}));
  assert.equal(res.status,200);
  assert.equal(h.shippoBodies.length,2);
  assert.equal(h.shippoBodies[1].extra,undefined);
  assert.equal(h.stripeCalls[0].line_items.some(item=>item.price_data.unit_amount===704),true,'the fallback price is the unsigned rate with the marketplace markup');
});
