import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; the Stripe SDK boundary is supplied per test.
const source=await readFile(new URL('../supabase/functions/release-stale-escrow/handler.js',import.meta.url),'utf8');
const load=Stripe=>new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;')(Stripe);

function makeEnv({due=[],dueError=null,markError=null,accounts={}}={}) {
  const transfers=[],rpcCalls=[];
  class Stripe {
    static createFetchHttpClient(){}
    paymentIntents={retrieve:async id=>({latest_charge:'ch_'+id})};
    transfers={create:async(args,options)=>{transfers.push({args,options});return {id:'tr_'+transfers.length};}};
  }
  const service={
    rpc:async(name,args)=>{
      rpcCalls.push([name,args]);
      if(name==='due_releases') return {data:due,error:dueError};
      if(name==='mark_purchase_released') return {error:markError};
      return {error:null};
    },
    from:table=>{
      if(table!=='stripe_accounts') throw new Error('unexpected table '+table);
      return {select:()=>({eq:(col,val)=>({maybeSingle:async()=>({data:accounts[val]?{stripe_account_id:accounts[val]}:null})})})};
    },
  };
  const handler=load(Stripe)({env:()=> 'test-key',createClient:()=>service});
  return {handler,transfers,rpcCalls};
}
const post=()=>new Request('https://example.test',{method:'POST'});
const row=(id,seller)=>({id,seller_id:seller,stripe_payment_intent_id:'pi_'+id,seller_payout_cents:1000,escrow_status:'held'});

test('payout sweep pays exactly what the database says is due, once, with an idempotency key', async () => {
  const {handler,transfers,rpcCalls}=makeEnv({due:[row('p1','s1'),row('p2','s2')],accounts:{s1:'acct_1',s2:'acct_2'}});
  const res=await handler(post());
  assert.equal(res.status,200);
  assert.equal((await res.json()).released,2);
  assert.deepEqual(transfers.map(t=>t.args.destination),['acct_1','acct_2']);
  assert.deepEqual(transfers.map(t=>t.options.idempotencyKey),['release-p1','release-p2']);
  assert.deepEqual(transfers[0].args,{amount:1000,currency:'usd',destination:'acct_1',source_transaction:'ch_pi_p1'});
  assert.deepEqual(rpcCalls.filter(c=>c[0]==='mark_purchase_released').map(c=>c[1].p_purchase_id),['p1','p2']);
});

test('payout sweep: nothing due means no Stripe calls, a seller without a payout account is skipped, and a query error is a 500', async () => {
  let env=makeEnv({due:[]});
  assert.equal((await (await env.handler(post())).json()).released,0);
  assert.equal(env.transfers.length,0);

  env=makeEnv({due:[row('p1','s1')],accounts:{}});
  assert.equal((await (await env.handler(post())).json()).released,0);
  assert.equal(env.transfers.length,0);

  env=makeEnv({dueError:{message:'down'}});
  assert.equal((await env.handler(post())).status,500);
});

test('payout sweep: a transfer that cannot be recorded is not counted and alerts the operator', async () => {
  const {handler,transfers,rpcCalls}=makeEnv({due:[row('p1','s1')],accounts:{s1:'acct_1'},markError:{message:'db down'}});
  const res=await handler(post());
  assert.equal((await res.json()).released,0);
  assert.equal(transfers.length,1);
  const alert=rpcCalls.find(c=>c[0]==='notify_operator_alert');
  assert.ok(alert);
  assert.equal(alert[1].p_event,'Admin Alert: Payment Problem');
  assert.equal(alert[1].p_properties.reference,'tr_1');
});
