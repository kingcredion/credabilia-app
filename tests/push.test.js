import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/send-push/handler.js';

const ADDRESS = {name:'Jamie Buyer',street1:'123 Main St',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('push subscriptions: ownership, upsert-by-endpoint, and notify_push never breaks the caller',async()=>{
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
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;
      -- Minimal stand-ins for Supabase's pgcrypto/Vault, which PGlite doesn't ship: just enough
      -- for the migration's vault.create_secret(...) seeding statement to run.
      create schema vault;
      create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text,created_at timestamptz not null default now());
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(p_secret text,p_name text,p_description text default null) returns uuid language plpgsql as $$
        declare new_id uuid; begin insert into vault.secrets(name,secret,description) values(p_name,p_secret,p_description) returning id into new_id; return new_id; end;$$;
      create function public.gen_random_bytes(p_len integer) returns bytea language sql as $$select decode(md5(random()::text||clock_timestamp()::text),'hex')$$;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609300032_push_notifications.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2),($3)',[seller,buyer,other]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as('','anon');
    await assert.rejects(db.query("select public.save_push_subscription('https://push.example/a','p256','auth')"),/permission denied/);

    await as(seller);
    await db.query("select public.save_push_subscription('https://push.example/a','p256-1','auth-1')");
    // Re-subscribing the same endpoint (e.g. the browser handed back an existing subscription)
    // updates in place rather than erroring or duplicating.
    await db.query("select public.save_push_subscription('https://push.example/a','p256-2','auth-2')");
    let row=(await raw("select p256dh,auth,user_id from public.push_subscriptions where endpoint='https://push.example/a'")).rows[0];
    assert.equal(row.p256dh,'p256-2');assert.equal(row.user_id,seller);

    // A stranger can't remove someone else's subscription.
    await as(other);
    await db.query("select public.remove_push_subscription('https://push.example/a')");
    row=(await raw("select 1 from public.push_subscriptions where endpoint='https://push.example/a'")).rows[0];
    assert.ok(row,'subscription must survive a removal attempt by a non-owner');

    await as(seller);
    await db.query("select public.remove_push_subscription('https://push.example/a')");
    row=(await raw("select 1 from public.push_subscriptions where endpoint='https://push.example/a'")).rows[0];
    assert.equal(row,undefined);

    // notify_push is called from inside send_message/request_refund/offer_partial_refund/require_return.
    // PGlite has no pg_net, so net.http_post doesn't exist there -- notify_push's own exception
    // handler must swallow that, and the caller's primary action must still succeed, exactly as
    // it would in production if the send-push edge function were ever briefly unreachable.
    await as(seller);
    await db.query("select public.save_push_subscription('https://push.example/b','p256','auth')");

    async function makePurchase(stripeSessionId,paymentIntentId){
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
    const purchaseId=await makePurchase('cs_test_push','pi_test_push');

    await as(buyer);
    await db.query("select public.send_message($1,'Is this still available?')",[purchaseId]);
    const refund=(await db.query("select public.request_refund($1,'Wrong item.') as r",[purchaseId])).rows[0].r;
    await as(seller);
    await db.query("select public.offer_partial_refund($1,$2)",[refund.id,1000]);
  } finally { await db.close(); }
});

test('send-push handler validates the shared secret and VAPID config, sends to every device, and self-cleans expired subscriptions',async()=>{
  const secret='test-secret';
  let deleted=[];
  const subs=[
    {endpoint:'https://push.example/1',p256dh:'p1',auth:'a1'},
    {endpoint:'https://push.example/2',p256dh:'p2',auth:'a2'},
  ];
  const sent=[];
  const createClient=()=>({
    from:table=>{
      if(table!=='push_subscriptions') throw new Error('unexpected table '+table);
      return {
        select:()=>({eq:()=>Promise.resolve({data:subs,error:null})}),
        delete:()=>({eq:(column,value)=>{deleted.push(value);return Promise.resolve({error:null});}}),
      };
    },
  });
  async function sendPush(subscription,payload) {
    sent.push({endpoint:subscription.endpoint,payload});
    if(subscription.endpoint==='https://push.example/2') { const err=new Error('gone'); err.statusCode=410; throw err; }
  }
  const env=key=>({PUSH_TRIGGER_SECRET:secret,VAPID_PUBLIC_KEY:'pub',VAPID_PRIVATE_KEY:'priv',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'service'}[key]);
  const handler=createHandler({createClient,env,sendPush});
  const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{'x-push-secret':secret,...headers},body:JSON.stringify(body)});

  assert.equal((await handler(request({user_id:'u1',title:'Hi'},{'x-push-secret':'wrong'}))).status,401);

  const noSecretEnv=key=>({PUSH_TRIGGER_SECRET:secret}[key]);
  assert.equal((await createHandler({createClient,env:noSecretEnv,sendPush})(request({user_id:'u1',title:'Hi'}))).status,503);

  const result=await handler(request({user_id:'u1',title:'New message',body:'hello',url:'/?item=x'}));
  assert.equal(result.status,200);
  const body=await result.json();
  assert.equal(body.sent,1);assert.equal(body.removed,1);
  assert.deepEqual(deleted,['https://push.example/2']);
  assert.equal(sent.length,2);
  assert.deepEqual(JSON.parse(sent[0].payload),{title:'New message',body:'hello',url:'/?item=x'});
});
