import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary.
const source=await readFile(new URL('../supabase/functions/seller-account-settings/handler.js',import.meta.url),'utf8');
const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

const req=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});

function setup({accounts,operator=true,updateFails=[],signedIn=true}={}) {
  const updates=[];
  const list=accounts||[
    {id:'acct_on',email:'a@x.test',payouts_enabled:true,settings:{payouts:{debit_negative_balances:true}},controller:{losses:{payments:'application'}}},
    {id:'acct_off',email:'b@x.test',payouts_enabled:true,settings:{payouts:{debit_negative_balances:false}},controller:{losses:{payments:'application'}}},
  ];
  class Stripe {
    static createFetchHttpClient(){}
    accounts={
      list:async()=>({data:list,has_more:false}),
      update:async(id,params)=>{if(updateFails.includes(id)) throw new Error('Cannot update this account');updates.push({id,params});return {id};},
    };
  }
  const userClient={auth:{getUser:async()=>signedIn?{data:{user:{id:'op'}},error:null}:{data:{user:null},error:{message:'x'}}},rpc:async()=>({data:operator,error:null})};
  const env=name=>({SUPABASE_URL:'u',SUPABASE_ANON_KEY:'anon',STRIPE_SECRET_KEY:'sk'}[name]);
  return {handler:load(Stripe)({createClient:()=>userClient,env}),updates};
}

test('reports which seller accounts have the setting off and changes nothing', async () => {
  const t=setup();
  const res=await t.handler(req({}));
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.off,1);
  assert.deepEqual(body.accounts.map(a=>[a.id,a.debit_negative_balances]),[['acct_on',true],['acct_off',false]]);
  assert.equal(t.updates.length,0);
});

test('fix turns the setting on only where it is off', async () => {
  const t=setup();
  const body=await (await t.handler(req({fix:true}))).json();
  assert.equal(body.off,0);
  assert.deepEqual(t.updates,[{id:'acct_off',params:{settings:{payouts:{debit_negative_balances:true}}}}]);
  assert.equal(body.accounts.find(a=>a.id==='acct_off').changed,true);
});

test('an account Stripe will not update is reported with the reason', async () => {
  const t=setup({updateFails:['acct_off']});
  const body=await (await t.handler(req({fix:true}))).json();
  assert.equal(body.off,1);
  assert.match(body.accounts.find(a=>a.id==='acct_off').error,/Cannot update/);
});

test('non-operators and signed-out callers are refused', async () => {
  assert.equal((await setup({operator:false}).handler(req({fix:true}))).status,403);
  assert.equal((await setup({signedIn:false}).handler(req({}))).status,401);
  assert.equal((await setup().handler(new Request('https://example.test',{method:'POST',body:'{}'}))).status,401);
  assert.equal((await setup().handler(new Request('https://example.test',{method:'GET'}))).status,405);
});
