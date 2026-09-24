import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary, same technique
// already used in tests/refunds.test.js/tests/stripeWebhook.test.js. Stripe itself is never
// actually called in these tests (the mocked stripe_accounts lookup returns no account, so
// releaseEscrow returns before ever touching it), so the placeholder value is never invoked.
const source=await readFile(new URL('../supabase/functions/release-stale-escrow/handler.js',import.meta.url),'utf8');
const createHandler=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;')(class{});

// Chainable, thenable query-builder stub -- every filter method (.eq/.not/.lt/.in) just records
// itself and returns `this`; awaiting the object resolves it via `resolve`, matching how the real
// supabase-js query builder works (a thenable, not an actual Promise until awaited).
function chain(resolve) {
  const calls=[];
  const builder={
    eq:(...a)=>{calls.push(['eq',...a]);return builder;},
    not:(...a)=>{calls.push(['not',...a]);return builder;},
    lt:(...a)=>{calls.push(['lt',...a]);return builder;},
    in:(...a)=>{calls.push(['in',...a]);return builder;},
    maybeSingle:async()=>resolve(calls),
    then:(onFulfilled)=>Promise.resolve(resolve(calls)).then(onFulfilled),
  };
  return builder;
}

// purchases.select() is called twice in a fixed order (shipped query, then pickup query) --
// tracked by a counter so each call resolves with the right canned rows.
function makeService({shippedRows=[], pickupRows=[], disputedPurchaseIds=[]}) {
  let purchasesSelectCalls=0;
  const stripeAccountLookups=[];
  const service={
    from(table){
      if(table==='purchases') return {select:()=>{
        purchasesSelectCalls++;
        const isShippedQuery=purchasesSelectCalls===1;
        return chain(()=>({data:isShippedQuery?shippedRows:pickupRows,error:null}));
      }};
      if(table==='refund_requests') return {select:()=>chain(()=>({data:disputedPurchaseIds.map(id=>({purchase_id:id})),error:null}))};
      if(table==='stripe_accounts') return {select:()=>({eq:(col,val)=>({maybeSingle:async()=>{stripeAccountLookups.push(val);return {data:null};}})})};
      throw new Error('unexpected table '+table);
    },
  };
  return {service,stripeAccountLookups};
}

test('release-stale-escrow: a stale pickup purchase with an open dispute is excluded from auto-release', async () => {
  const {service,stripeAccountLookups}=makeService({
    pickupRows:[
      {id:'p-disputed',seller_id:'s1',stripe_payment_intent_id:'pi_1',seller_payout_cents:1000,escrow_status:'held'},
      {id:'p-clean',seller_id:'s2',stripe_payment_intent_id:'pi_2',seller_payout_cents:2000,escrow_status:'held'},
    ],
    disputedPurchaseIds:['p-disputed'],
  });
  const handler=createHandler({env:()=>'test-key',createClient:()=>service});
  const result=await handler(new Request('https://example.test',{method:'POST'}));
  assert.equal(result.status,200);
  // Both purchases reach the release attempt loop only for the non-disputed one -- verified by
  // which seller_ids actually got a stripe_accounts lookup (releaseEscrow's first real action).
  assert.deepEqual(stripeAccountLookups,['s2']);
});

test('release-stale-escrow: a stale pickup purchase with no open dispute is still released as normal', async () => {
  const {service,stripeAccountLookups}=makeService({
    pickupRows:[{id:'p-clean',seller_id:'s3',stripe_payment_intent_id:'pi_3',seller_payout_cents:500,escrow_status:'held'}],
    disputedPurchaseIds:[],
  });
  const handler=createHandler({env:()=>'test-key',createClient:()=>service});
  await handler(new Request('https://example.test',{method:'POST'}));
  assert.deepEqual(stripeAccountLookups,['s3']);
});

test('release-stale-escrow: a resolved (refunded/denied) refund request does not block release', async () => {
  // Only 'pending'/'contested' count as open -- the handler's .in('status',['pending','contested'])
  // query already only ever returns those, so a resolved dispute simply never appears here.
  const {service,stripeAccountLookups}=makeService({
    pickupRows:[{id:'p-resolved',seller_id:'s4',stripe_payment_intent_id:'pi_4',seller_payout_cents:750,escrow_status:'held'}],
    disputedPurchaseIds:[],
  });
  const handler=createHandler({env:()=>'test-key',createClient:()=>service});
  await handler(new Request('https://example.test',{method:'POST'}));
  assert.deepEqual(stripeAccountLookups,['s4']);
});
