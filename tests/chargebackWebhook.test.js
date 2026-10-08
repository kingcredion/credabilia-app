import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary.
const source=await readFile(new URL('../supabase/functions/stripe-webhook/handler.js',import.meta.url),'utf8');
const load=new Function('Stripe',source.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

const PACKET={title:'Signed jersey',description:'A fictional jersey.',category:'Sports',price_cents:60000,purchased_at:'2026-10-01T10:00:00Z',
  fulfillment_method:'ship',shipping_address:{name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'},
  shipping_provider:'USPS',tracking_number:'9400TRACK',shipped_at:'2026-10-02T10:00:00Z',delivered_at:'2026-10-05T10:00:00Z',signature_required:true,
  inspection_accepted_at:null,disclosure_text:'This item has no certificate of authenticity.',disclosure_version:'cert-2026-10-08',disclosure_acknowledged_at:'2026-10-01T10:00:00Z',
  certificate_issuer:null,certificate_number:null,seller_attested_at:'2026-09-20T10:00:00Z',credibility_note:'Scores are opinions.',buyer_message_count:2,refund_request_count:0,
  buyer_name:'Jamie Buyer',buyer_email:'jamie@example.test'};

function setup({rpcError=null,open=true,sellerPaid=false,packetFails=false,stripeFails=false}={}) {
  const calls=[],alerts=[],updates=[];
  let event;
  class Stripe {
    static createFetchHttpClient(){}
    static createSubtleCryptoProvider(){}
    webhooks={constructEventAsync:async()=>event};
    disputes={update:async(id,args)=>{if(stripeFails) throw Error('stripe down');updates.push([id,args]);return {};}};
  }
  const client={rpc:async(name,args)=>{
    if(name==='notify_operator_alert'){alerts.push(args.p_properties);return {error:null};}
    calls.push([name,args]);
    if(name==='record_stripe_dispute') return rpcError?{error:{message:rpcError}}:{data:{purchase_id:'purchase-1',seller_id:'seller-1',seller_already_paid:sellerPaid,transfer_id:sellerPaid?'tr_1':null,open},error:null};
    if(name==='dispute_evidence_packet') return packetFails?{data:null,error:{message:'x'}}:{data:PACKET,error:null};
    return {error:null};
  }};
  const handler=load(Stripe)({env:()=> 'test',createClient:()=>client});
  const send=type=>{event={type,data:{object:{id:'dp_1',payment_intent:'pi_1',charge:'ch_1',amount:60000,reason:'product_not_received',status:type.endsWith('closed')?'won':'needs_response',evidence_details:{due_by:1900000000}}}};
    return handler(new Request('https://example.test',{method:'POST',headers:{'Stripe-Signature':'test'},body:'{}'}));};
  return {send,calls,alerts,updates};
}

test('a new chargeback is recorded, the operator is told, and the evidence is saved as a draft and not submitted',async()=>{
  const t=setup();
  assert.equal((await t.send('charge.dispute.created')).status,200);
  const record=t.calls.find(c=>c[0]==='record_stripe_dispute')[1].p_dispute;
  assert.equal(record.id,'dp_1');assert.equal(record.payment_intent,'pi_1');assert.equal(record.amount,60000);assert.equal(record.evidence_due_by,'1900000000');
  assert.equal(t.updates.length,1);
  const [id,args]=t.updates[0];
  assert.equal(id,'dp_1');
  assert.equal(args.submit,false,'evidence is never submitted automatically');
  assert.match(args.evidence.uncategorized_text,/no certificate of authenticity/);
  assert.match(args.evidence.uncategorized_text,/signature was required/);
  assert.match(args.evidence.uncategorized_text,/delivered on 2026-10-05/);
  assert.equal(args.evidence.shipping_tracking_number,'9400TRACK');
  assert.equal(args.evidence.shipping_date,'2026-10-02');
  assert.match(args.evidence.shipping_address,/123 Main St/);
  for(const value of Object.values(args.evidence)) assert.ok(String(value).length<20000);
  assert.ok(t.calls.some(c=>c[0]==='mark_dispute_progress'));
  assert.equal(t.alerts.length,1);
  assert.match(t.alerts[0].summary,/chargeback was filed/);
  assert.match(t.alerts[0].detail,/respond by 2030-03-17/);
  assert.match(t.alerts[0].detail,/draft of the evidence is saved/);
  assert.doesNotMatch(t.alerts[0].detail,/reversing transfer/,'no clawback is suggested when the seller has not been paid');
});

test('a chargeback on an order the seller was already paid for tells the operator which transfer to consider reversing',async()=>{
  const t=setup({sellerPaid:true});
  assert.equal((await t.send('charge.dispute.created')).status,200);
  assert.match(t.alerts[0].detail,/payouts are frozen/);
  assert.match(t.alerts[0].detail,/tr_1/);
});

test('a failure to draft the evidence never fails the webhook, but a failure to record the dispute does so Stripe retries',async()=>{
  const drafting=setup({stripeFails:true});
  assert.equal((await drafting.send('charge.dispute.created')).status,200);
  assert.match(drafting.alerts[0].detail,/could not be drafted/);

  const noPacket=setup({packetFails:true});
  assert.equal((await noPacket.send('charge.dispute.created')).status,200);
  assert.equal(noPacket.updates.length,0);

  const broken=setup({rpcError:'database unavailable'});
  assert.equal((await broken.send('charge.dispute.created')).status,500);
  assert.match(broken.alerts[0].summary,/could not be recorded/);
});

test('updates and closing are recorded; a closed dispute tells the operator the result and leaves the order held',async()=>{
  const updated=setup();
  assert.equal((await updated.send('charge.dispute.updated')).status,200);
  assert.equal(updated.alerts.length,0,'a routine update is recorded quietly');
  assert.equal(updated.updates.length,0);

  const closed=setup();
  assert.equal((await closed.send('charge.dispute.closed')).status,200);
  assert.match(closed.alerts[0].summary,/we won it/);
  assert.match(closed.alerts[0].detail,/stays on hold/);
  assert.equal(closed.updates.length,0);
});

test('a dispute with no matching order is still recorded and flagged, with no evidence drafted',async()=>{
  const t=setup({open:false});
  assert.equal((await t.send('charge.dispute.created')).status,200);
  assert.equal(t.updates.length,0);
  assert.match(t.alerts[0].summary,/chargeback was filed/);
});
