import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Node cannot resolve Deno's npm: import; supply only the Stripe SDK boundary, same technique
// already used in tests/stripeWebhook.test.js.
const processRefundSource=await readFile(new URL('../supabase/functions/process-refund/handler.js',import.meta.url),'utf8');
const loadProcessRefund=new Function('Stripe',processRefundSource.replace("import Stripe from 'npm:stripe@17';",'').replace('export function createHandler','function createHandler')+'\nreturn createHandler;');

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('refund requests: request/respond/process lifecycle, permissions, and the operator-only dispute count',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',
    operator='a9028fe8-c514-47bd-a873-ccd78251783a',other='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3),($4)',[seller,buyer,operator,other]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(seller);
    await db.query("select public.save_shipping_address($1)",[{...ADDRESS,name:'Sam Seller'}]);
    await db.query("select public.save_stripe_account('acct_test_seller')");
    await as(seller,'service_role');
    await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
    await as(seller);
    const listingId=(await db.query("select public.create_listing_with_details('Fictional item','A fictional description for testing.','Sports',5000,'',null,null,null,'[]','{}','[]',8,8,6,4,false) as id")).rows[0].id;

    await as(buyer);
    const reservation=(await db.query('select public.reserve_listing_checkout($1,$2) as r',[listingId,ADDRESS])).rows[0].r;
    await db.query("select public.attach_stripe_checkout_session($1,'cs_test_refund',$2,$3)",[reservation.checkout_session_id,0,0]);
    await as(buyer,'service_role');
    const purchaseId=(await db.query("select public.finalize_checkout_session('cs_test_refund','pi_test_refund') as id")).rows[0].id;

    // --- only the buyer can request a refund on their own purchase ---
    await as(other);
    await assert.rejects(db.query("select public.request_refund($1,'not as described')",[purchaseId]),/not found/);
    await as(buyer);
    await assert.rejects(db.query("select public.request_refund($1,'')",[purchaseId]),/1 to 2000 characters/);
    const request=(await db.query("select public.request_refund($1,'Item arrived damaged.') as r",[purchaseId])).rows[0].r;
    assert.equal(request.status,'pending');

    // --- a second open request on the same purchase is rejected ---
    await assert.rejects(db.query("select public.request_refund($1,'again')",[purchaseId]),/already open/);

    // --- only the seller can respond, and only while pending ---
    await as(buyer);
    await assert.rejects(db.query("select public.respond_to_refund_request($1,true)",[request.id]),/not found/);
    await as(seller);
    const contested=(await db.query("select public.respond_to_refund_request($1,false,'Item was packed carefully.') as r",[request.id])).rows[0].r;
    assert.equal(contested.status,'contested');
    assert.equal(contested.seller_response,'Item was packed carefully.');
    await assert.rejects(db.query('select public.respond_to_refund_request($1,true)',[request.id]),/already been responded to/);

    // --- operator_open_dispute_count(): null for everyone except the hardcoded operator id ---
    await as(buyer);
    assert.equal((await db.query('select public.operator_open_dispute_count() as n')).rows[0].n,null);
    await as(seller);
    assert.equal((await db.query('select public.operator_open_dispute_count() as n')).rows[0].n,null);
    await as(operator);
    assert.equal((await db.query('select public.operator_open_dispute_count() as n')).rows[0].n,1);

    // --- operator approves the contested case -- moves it to 'accepted', same state the edge
    // function looks for regardless of whether the seller or the operator got it there ---
    await raw("update public.refund_requests set status='accepted' where id=$1",[request.id]);

    // --- mark_refund_processed: service_role only, and only once ---
    await as(seller);
    await assert.rejects(db.query("select public.mark_refund_processed($1,'re_test_1')",[request.id]),/permission denied/);
    await as(other,'anon');
    await assert.rejects(db.query("select public.mark_refund_processed($1,'re_test_1')",[request.id]),/permission denied/);
    await raw("select public.mark_refund_processed($1,'re_test_1')",[request.id]);
    const resolved=(await raw('select status,resolved_at from public.refund_requests where id=$1',[request.id])).rows[0];
    assert.equal(resolved.status,'refunded');
    assert.ok(resolved.resolved_at);
    const purchase=(await raw('select escrow_status from public.purchases where id=$1',[purchaseId])).rows[0];
    assert.equal(purchase.escrow_status,'refunded');
    await assert.rejects(raw("select public.mark_refund_processed($1,'re_test_2')",[request.id]),/not ready to process/);

    // --- my_purchases()/my_sales() surface the refund fields ---
    await as(buyer);
    const mine=(await db.query('select public.my_purchases() as p')).rows[0].p.find(x=>x.purchase_id===purchaseId);
    assert.equal(mine.refund_status,'refunded');
    assert.equal(mine.refund_reason,'Item arrived damaged.');
    await as(seller);
    const sold=(await db.query('select public.my_sales() as s')).rows[0].s.find(x=>x.id===purchaseId);
    assert.equal(sold.refund_status,'refunded');
    assert.equal(sold.refund_seller_response,'Item was packed carefully.');

    // --- a refunded order can't have a second refund requested ---
    await as(buyer);
    await assert.rejects(db.query("select public.request_refund($1,'again')",[purchaseId]),/already been refunded/);
  } finally { await db.close(); }
});

test('process-refund handler: held purchases refund directly, released purchases reverse the transfer first',async()=>{
  let calls=[];
  function makeHandler({requestStatus='accepted',escrowStatus='held',sellerId='seller-1',validUser=true}={}) {
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
        auth:{getUser:async()=>({data:{user:validUser?{id:sellerId}:null}})},
        from:(table)=>({select:()=>({eq:()=>({maybeSingle:async()=>{
          if(table==='refund_requests') return {data:{id:'req-1',purchase_id:'purchase-1',seller_id:'seller-1',status:requestStatus},error:null};
          if(table==='purchases') return {data:{id:'purchase-1',stripe_payment_intent_id:'pi_test',escrow_status:escrowStatus,stripe_transfer_id:'tr_test'},error:null};
          throw new Error('unexpected table '+table);
        }})})}),
        rpc:(name,args)=>{marked.push([name,args]);return Promise.resolve({error:null});},
      }),
    })};
  }
  const request=body=>new Request('http://x',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});

  {
    const {handler,calls:marked}=makeHandler({escrowStatus:'held'});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,200);
    assert.deepEqual(calls.map(c=>c[0]),['refund']);
    assert.equal(marked[0][0],'mark_refund_processed');
    calls.length=0;
  }
  {
    const {handler}=makeHandler({escrowStatus:'released'});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,200);
    assert.deepEqual(calls.map(c=>c[0]),['reversal','refund']);
    calls.length=0;
  }
  {
    // Not the seller on this request -- rejected even though the request itself is valid.
    const {handler}=makeHandler({sellerId:'someone-else'});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,403);
  }
  {
    // No resolvable user (the operator/service-role path) -- allowed through.
    const {handler}=makeHandler({validUser:false});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,200);
  }
  {
    const {handler}=makeHandler({requestStatus:'pending'});
    const res=await handler(request({refund_request_id:'11111111-1111-4111-8111-111111111111'}));
    assert.equal(res.status,400);
  }
});
