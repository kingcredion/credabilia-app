import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary.
const source=await readFile(new URL('../supabase/functions/reverse-transfer/handler.js',import.meta.url),'utf8');
const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

const PURCHASE='44444444-4444-4444-8444-444444444444';
const req=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});

function setup({info={eligible:true,transfer_id:'tr_1',has_dispute:true,already_reversed:false},infoError=null,transfer={amount:4000,amount_reversed:0},reversalFails=false,recordError=null,signedIn=true}={}) {
  const reversals=[],records=[];
  class Stripe {
    static createFetchHttpClient(){}
    transfers={
      retrieve:async id=>({id,...transfer}),
      createReversal:async(id,params,options)=>{if(reversalFails) throw new Error('Insufficient funds in the connected account');reversals.push({id,params,options});return {id:'trr_1'};},
    };
  }
  const userClient={auth:{getUser:async()=>signedIn?{data:{user:{id:'operator-1'}},error:null}:{data:{user:null},error:{message:'x'}}},
    rpc:async(name)=>name==='admin_transfer_reversal_info'?(infoError?{data:null,error:{message:infoError}}:{data:info,error:null}):{data:null,error:null}};
  const service={rpc:async(name,args)=>{records.push([name,args]);return {error:recordError?{message:recordError}:null};}};
  const createClient=(url,key)=>key==='service'?service:userClient;
  const env=name=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',STRIPE_SECRET_KEY:'sk'}[name]);
  return {handler:load(Stripe)({createClient,env}),reversals,records};
}

test('an operator reverses the unreversed part of the transfer once, with an idempotency key, and the result is recorded', async () => {
  const t=setup({transfer:{amount:4000,amount_reversed:1000}});
  const res=await t.handler(req({purchase_id:PURCHASE}));
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.reversed,true); assert.equal(body.amount_cents,3000);
  assert.equal(t.reversals.length,1);
  assert.equal(t.reversals[0].id,'tr_1');
  assert.equal(t.reversals[0].params.amount,3000,'only what has not already been reversed');
  assert.equal(t.reversals[0].params.metadata.purchase_id,PURCHASE);
  assert.equal(t.reversals[0].options.idempotencyKey,'dispute-reverse-'+PURCHASE);
  assert.deepEqual(t.records[0],['record_transfer_reversal',{p_purchase_id:PURCHASE,p_reversal_id:'trr_1',p_amount_cents:3000,p_operator:'operator-1'}]);
});

test('a non-operator is refused and nothing is sent to Stripe', async () => {
  const t=setup({infoError:'Not authorized'});
  const res=await t.handler(req({purchase_id:PURCHASE}));
  assert.equal(res.status,403);
  assert.equal(t.reversals.length,0); assert.equal(t.records.length,0);
});

test('an order that is not eligible, or is already reversed, is refused with a clear reason', async () => {
  const noDispute=setup({info:{eligible:false,has_dispute:false,already_reversed:false}});
  let res=await noDispute.handler(req({purchase_id:PURCHASE}));
  assert.equal(res.status,409); assert.match((await res.json()).error,/no recorded chargeback/);
  const again=setup({info:{eligible:false,has_dispute:true,already_reversed:true}});
  res=await again.handler(req({purchase_id:PURCHASE}));
  assert.equal(res.status,409); assert.match((await res.json()).error,/already been taken back/);
  assert.equal(noDispute.reversals.length+again.reversals.length,0);
});

test('if Stripe cannot reverse the transfer, the operator is told why and nothing is recorded', async () => {
  const t=setup({reversalFails:true});
  const res=await t.handler(req({purchase_id:PURCHASE}));
  assert.equal(res.status,409);
  assert.match((await res.json()).error,/Insufficient funds/);
  assert.equal(t.records.length,0);
});

test('a transfer that is already fully reversed in Stripe records the result without a second reversal', async () => {
  const t=setup({transfer:{amount:4000,amount_reversed:4000}});
  const res=await t.handler(req({purchase_id:PURCHASE}));
  assert.equal(res.status,200);
  assert.equal(t.reversals.length,0);
  assert.equal(t.records.length,1);
});

test('bad requests and signed-out callers are rejected', async () => {
  const t=setup();
  assert.equal((await t.handler(req({purchase_id:'nope'}))).status,400);
  assert.equal((await t.handler(new Request('https://example.test',{method:'POST',body:'{}'}))).status,401);
  assert.equal((await setup({signedIn:false}).handler(req({purchase_id:PURCHASE}))).status,401);
  assert.equal((await t.handler(new Request('https://example.test',{method:'GET'}))).status,405);
});
