import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary, same technique
// already used in tests/stripeWebhook.test.js and tests/refunds.test.js.
const processRefundSource=await readFile(new URL('../supabase/functions/process-refund/handler.js',import.meta.url),'utf8');
const loadProcessRefund=new Function('Stripe',processRefundSource.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('partial refunds and required returns: offer/accept, return-required lifecycle, and mark_refund_processed branching',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    other='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}
    async function makePurchase(stripeSessionId,paymentIntentId){
      // Each purchase needs its own fresh listing -- a listing is no longer available once bought.
      await as(seller);
      const newListingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;
      await as(buyer);
      const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[newListingId,ADDRESS])).rows[0].r;
      await db.query("select public.attach_stripe_checkout_session($1,$2,$3,$4)",[reservation.checkout_session_id,stripeSessionId,0,0]);
      await as(buyer,'service_role');
      return (await db.query("select public.finalize_checkout_session($1,$2) as id",[stripeSessionId,paymentIntentId])).rows[0].id;
    }

    await as(seller);
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");

    // === Partial refund: offer, bounds, buyer accept/decline ===
    const purchase1=await makePurchase('cs_test_partial','pi_test_partial');
    await as(buyer);
    const req1=(await db.query("select public.request_refund($1,'Missing an accessory.') as r",[purchase1])).rows[0].r;

    await as(other);
    await assert.rejects(db.query('select public.offer_partial_refund($1,$2)',[req1.id,1000]),/not found/);
    await as(seller);
    await assert.rejects(db.query('select public.offer_partial_refund($1,$2)',[req1.id,0]),/less than the item price/);
    await assert.rejects(db.query('select public.offer_partial_refund($1,$2)',[req1.id,5000]),/less than the item price/);
    const offered=(await db.query("select public.offer_partial_refund($1,$2,'Half back for the missing piece.') as r",[req1.id,1500])).rows[0].r;
    assert.equal(offered.status,'partial_offered');
    assert.equal(offered.offered_amount_cents,1500);
    await assert.rejects(db.query('select public.offer_partial_refund($1,$2)',[req1.id,1000]),/already been responded to/);

    // Only the buyer responds, and only while an offer is outstanding.
    await as(seller);
    await assert.rejects(db.query('select public.respond_to_partial_offer($1,true)',[req1.id]),/not found/);
    await as(buyer);
    const declined=(await db.query('select public.respond_to_partial_offer($1,false) as r',[req1.id])).rows[0].r;
    assert.equal(declined.status,'contested');
    await assert.rejects(db.query('select public.respond_to_partial_offer($1,true)',[req1.id]),/no partial offer/);

    // Re-run on a second purchase, this time buyer accepts -- lands in 'accepted' carrying the amount.
    const purchase2=await makePurchase('cs_test_partial2','pi_test_partial2');
    await as(buyer);
    const req2=(await db.query("select public.request_refund($1,'Not as described.') as r",[purchase2])).rows[0].r;
    await as(seller);
    await db.query("select public.offer_partial_refund($1,$2)",[req2.id,2000]);
    await as(buyer);
    const accepted=(await db.query('select public.respond_to_partial_offer($1,true) as r',[req2.id])).rows[0].r;
    assert.equal(accepted.status,'accepted');
    assert.equal(accepted.offered_amount_cents,2000);

    // mark_refund_processed: partial amount < price -> purchases.escrow_status='partially_refunded'.
    await raw("select public.mark_refund_processed($1,'re_test_partial')",[req2.id]);
    const purchase2Row=(await raw('select escrow_status from public.purchases where id=$1',[purchase2])).rows[0];
    assert.equal(purchase2Row.escrow_status,'partially_refunded');
    const req2Row=(await raw('select status from public.refund_requests where id=$1',[req2.id])).rows[0];
    assert.equal(req2Row.status,'refunded');

    // === Required return: seller requires the item back, buyer ships it, delivery triggers a full refund ===
    const purchase3=await makePurchase('cs_test_return','pi_test_return');
    await as(buyer);
    const req3=(await db.query("select public.request_refund($1,'Wrong item entirely.') as r",[purchase3])).rows[0].r;

    await as(other);
    await assert.rejects(db.query('select public.require_return($1)',[req3.id]),/not found/);
    await as(seller);
    const returnRequired=(await db.query("select public.require_return($1,'Send it back and we will refund in full.') as r",[req3.id])).rows[0].r;
    assert.equal(returnRequired.status,'return_required');

    // record_return_shipment: buyer-only, requires return_required, idempotent against a retry.
    await as(seller);
    await assert.rejects(db.query("select public.record_return_shipment($1,'sh_1','TRACK1','https://track/1','https://label/1')",[req3.id]),/not found/);
    await as(buyer);
    await db.query("select public.record_return_shipment($1,'sh_1','TRACK1','https://track/1','https://label/1')",[req3.id]);
    // A retry after a dropped response must not overwrite the already-recorded shipment.
    await db.query("select public.record_return_shipment($1,'sh_2','TRACK2','https://track/2','https://label/2')",[req3.id]);
    const shipped=(await raw('select return_tracking_number,return_shipped_at from public.refund_requests where id=$1',[req3.id])).rows[0];
    assert.equal(shipped.return_tracking_number,'TRACK1');
    assert.ok(shipped.return_shipped_at);

    // mark_return_delivered: service_role only, requires return_required.
    await as(buyer);
    await assert.rejects(db.query('select public.mark_return_delivered($1)',[req3.id]),/permission denied/);
    await raw('select public.mark_return_delivered($1)',[req3.id]);
    const delivered=(await raw('select status,offered_amount_cents from public.refund_requests where id=$1',[req3.id])).rows[0];
    assert.equal(delivered.status,'accepted');
    assert.equal(delivered.offered_amount_cents,null);
    await assert.rejects(raw('select public.mark_return_delivered($1)',[req3.id]),/not found or not awaiting a return/);

    // mark_refund_processed: no offered_amount_cents -> purchases.escrow_status='refunded' (not partial).
    await raw("select public.mark_refund_processed($1,'re_test_return')",[req3.id]);
    const purchase3Row=(await raw('select escrow_status from public.purchases where id=$1',[purchase3])).rows[0];
    assert.equal(purchase3Row.escrow_status,'refunded');

    // my_purchases()/my_sales() surface the new return/partial fields.
    await as(buyer);
    const mine=(await db.query('select public.my_purchases() as p')).rows[0].p.find(x=>x.purchase_id===purchase3);
    assert.equal(mine.return_tracking_number,'TRACK1');
    assert.equal(mine.refund_status,'refunded');
    await as(seller);
    const sold=(await db.query('select public.my_sales() as s')).rows[0].s.find(x=>x.id===purchase2);
    assert.equal(sold.offered_amount_cents,2000);
  } finally { await db.close(); }
});

test('process-refund handler: passes offered_amount_cents through as a partial Stripe amount, omits it for a full refund',async()=>{
  let calls=[];
  function makeHandler({offeredAmountCents=null,callerId='seller-1'}={}) {
    const marked=[];
    class Stripe {
      static createFetchHttpClient(){}
      refunds={create:async(args)=>{calls.push(['refund',args]);return {id:'re_test_stub'};}};
      transferReversals={create:async(args)=>{calls.push(['reversal',args]);return {id:'trr_test_stub'};}};
    }
    const createHandler=loadProcessRefund(Stripe);
    return {calls:marked,handler:createHandler({
      env:key=>({STRIPE_SECRET_KEY:'test',SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[key]),
      createClient:(url,key)=>({
        auth:{getUser:async()=>({data:{user:{id:callerId}}})},
        from:(table)=>({select:()=>({eq:()=>({maybeSingle:async()=>{
          if(table==='refund_requests') return {data:{id:'req-1',purchase_id:'purchase-1',seller_id:'seller-1',buyer_id:'buyer-1',status:'accepted',offered_amount_cents:offeredAmountCents},error:null};
          if(table==='purchases') return {data:{id:'purchase-1',stripe_payment_intent_id:'pi_test',escrow_status:'released',stripe_transfer_id:'tr_test'},error:null};
          throw new Error('unexpected table '+table);
        }})})}),
        rpc:(name,args)=>{marked.push([name,args]);return Promise.resolve({error:null});},
      }),
    })};
  }
  const request=body=>new Request('http://x',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});

  {
    const {handler,calls:localCalls}=makeHandler({offeredAmountCents:1500});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,200);
    const [[,reversalArgs],[,refundArgs]]=calls;
    assert.equal(reversalArgs.amount,1500);
    assert.equal(refundArgs.amount,1500);
    calls.length=0;
  }
  {
    const {handler}=makeHandler({offeredAmountCents:null});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,200);
    const [[,reversalArgs],[,refundArgs]]=calls;
    assert.equal(reversalArgs.amount,undefined);
    assert.equal(refundArgs.amount,undefined);
    calls.length=0;
  }
  {
    // The buyer's own session triggers this after accepting a seller's partial offer -- not just
    // the seller. This is the exact path that failed live: buyer accepts, client calls
    // process-refund with the buyer's own token, and the handler used to only allow the seller.
    const {handler}=makeHandler({offeredAmountCents:1500,callerId:'buyer-1'});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,200);
    calls.length=0;
  }
  {
    // A stranger (neither seller nor buyer on this request) is still rejected.
    const {handler}=makeHandler({offeredAmountCents:1500,callerId:'someone-else'});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,403);
  }
});
