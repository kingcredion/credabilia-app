import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/support-chat/handler.js';

test('support chat: message round-trip, validation, service-role-only replies, and quota',async()=>{
  const db=new PGlite();
  const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[user,other]);
    async function as(actor,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);}
    async function raw(sql,params){await db.exec('reset role');return db.query(sql,params);}

    await as(user);
    await assert.rejects(db.query("select public.send_support_message('')"),/between 1 and 2000/);
    const sent=(await db.query("select public.send_support_message('How does escrow work?') as m")).rows[0].m;
    assert.equal(sent.role,'user');
    assert.equal(sent.body,'How does escrow work?');

    // The buyer cannot self-report an assistant reply -- only service_role can.
    await assert.rejects(db.query("select public.record_support_reply($1,'A fake reply')",[user]),/permission denied/);
    await as(other,'anon');
    await assert.rejects(db.query("select public.record_support_reply($1,'A fake reply')",[user]),/permission denied/);
    await raw("select public.record_support_reply($1,'Escrow holds your payment until delivery is confirmed.')",[user]);

    await as(user);
    const history=(await db.query('select public.get_support_messages() as h')).rows[0].h;
    assert.equal(history.length,2);
    assert.equal(history[0].role,'user');
    assert.equal(history[1].role,'assistant');

    // Another user's conversation stays private.
    await as(other);
    assert.deepEqual((await db.query('select public.get_support_messages() as h')).rows[0].h,[]);

    // Quota: 20/hour, then rejected.
    await as(user);
    for(let i=0;i<20;i++) await db.query('select public.consume_support_message()');
    await assert.rejects(db.query('select public.consume_support_message()'),/limit/);

    // A window that started over an hour ago resets the count instead of staying capped.
    await raw("update public.support_message_usage set window_start=now()-interval '2 hours' where user_id=$1",[user]);
    await db.query('select public.consume_support_message()');
    const usage=(await raw('select attempts from public.support_message_usage where user_id=$1',[user])).rows[0];
    assert.equal(usage.attempts,1);

    await as(other,'anon');
    await assert.rejects(db.query('select public.get_support_messages()'),/permission denied/);
  } finally { await db.close(); }
});

test('support chat handler validates identity/quota and never double-counts the new message in the AI input',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  let quota=false, configured=true, validUser=true, aiInput=null;
  const priorHistory=[{id:'a',role:'user',body:'Earlier question'},{id:'b',role:'assistant',body:'Earlier answer'}];
  const fetcher=async (url,opts)=>{
    if(url==='https://api.openai.com/v1/responses') { aiInput=JSON.parse(opts.body).input; return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'A real answer.'}]}]})}; }
    throw new Error('unexpected fetch '+url);
  };
  const handler=createHandler({fetcher,env:key=>({OPENAI_API_KEY:configured?'test-key':null,CERTIFICATE_AI_MODEL:configured?'test-model':null,SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[key]),
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},
      rpc:(name,args)=>{
        if(name==='consume_support_message') return Promise.resolve({error:quota?new Error('limit'):null});
        if(name==='get_support_messages') return Promise.resolve({data:priorHistory,error:null});
        if(name==='my_purchases') return Promise.resolve({data:[],error:null});
        if(name==='my_sales') return Promise.resolve({data:[],error:null});
        if(name==='my_credit_balance') return Promise.resolve({data:0,error:null});
        if(name==='send_support_message') return Promise.resolve({data:{id:'c',role:'user',body:args.p_body},error:null});
        if(name==='record_support_reply') return Promise.resolve({data:{id:'d',role:'assistant',body:args.p_body},error:null});
        throw new Error('unexpected rpc '+name);
      }})});
  const request=(body,authed=true)=>new Request('http://x',{method:'POST',headers:authed?{Authorization:'Bearer t'}:{},body:JSON.stringify(body)});

  assert.equal((await handler(request({body:'hi'},false))).status,401);
  validUser=false; assert.equal((await handler(request({body:'hi'}))).status,401); validUser=true;
  configured=false; assert.equal((await handler(request({body:'hi'}))).status,503); configured=true;
  assert.equal((await handler(request({body:''}))).status,400);
  quota=true; assert.equal((await handler(request({body:'hi'}))).status,429); quota=false;

  const response=await handler(request({body:'What about my newest order?'}));
  assert.equal(response.status,200);
  // Exactly the 2 prior history messages plus exactly 1 new entry for the current message --
  // never the new message counted twice (once via a re-fetched history, once as "new").
  assert.equal(aiInput.length,3);
  assert.equal(aiInput[2].content[0].text,'What about my newest order?');
  assert.equal(aiInput.filter(item=>item.content[0].text==='What about my newest order?').length,1);
});
