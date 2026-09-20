import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/generate-trivia/handler.js';

test('trivia is generated once, hidden until answered, answered once, and quota-limited',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609170009_trivia.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,other]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    await as(seller);
    const listingId=(await db.query("select public.create_listing('Fictional test item','A fictional description for testing.','Sports',100,'') as id")).rows[0].id;
    const options=['A','B','C','D'];
    const record=()=>db.query('select public.record_listing_trivia($1,$2,$3,$4,$5) as id',[listingId,'What matters most?',JSON.stringify(options),1,'Because B is a documented detail.']);
    const first=(await record()).rows[0].id;
    const second=(await record()).rows[0].id;
    assert.equal(first,second);

    await as('','anon');
    const hidden=(await db.query('select public.get_listing_trivia($1) as trivia',[listingId])).rows[0].trivia;
    assert.equal(hidden.question,'What matters most?');
    assert.deepEqual(hidden.options,options);
    assert.equal('correct_index' in hidden,false);
    assert.equal('explanation' in hidden,false);

    await as(other);
    const beforeAnswer=(await db.query('select public.get_listing_trivia($1) as trivia',[listingId])).rows[0].trivia;
    assert.equal('correct_index' in beforeAnswer,false);
    const answer=(await db.query('select public.submit_trivia_response($1,1::smallint) as result',[listingId])).rows[0].result;
    assert.equal(answer.xp_earned,3);
    assert.equal(answer.already_submitted,false);
    assert.equal(answer.correct,true);
    assert.equal((await db.query('select learning_xp from public.user_progress where user_id=$1',[other])).rows[0].learning_xp,3);
    const revealed=(await db.query('select public.get_listing_trivia($1) as trivia',[listingId])).rows[0].trivia;
    assert.equal(revealed.correct_index,1);
    assert.equal(revealed.explanation,'Because B is a documented detail.');
    assert.equal(revealed.your_answer,1);

    const repeat=(await db.query('select public.submit_trivia_response($1,0::smallint) as result',[listingId])).rows[0].result;
    assert.equal(repeat.already_submitted,true);
    assert.equal(repeat.xp_earned,0);
    assert.equal(repeat.correct,true);
    assert.equal((await db.query('select learning_xp from public.user_progress where user_id=$1',[other])).rows[0].learning_xp,3);

    await assert.rejects(db.query('select public.submit_trivia_response($1,99::smallint)',[listingId]),/Choose one of the listed options/);

    await as(seller);
    const sellerAnswer=(await db.query('select public.submit_trivia_response($1,1::smallint) as result',[listingId])).rows[0].result;
    assert.equal(sellerAnswer.xp_earned,3);

    for(let i=0;i<5;i++) await db.query('select public.consume_trivia_generation()');
    await assert.rejects(db.query('select public.consume_trivia_generation()'),/limit reached/);
    await assert.rejects(db.query('delete from public.listing_trivia'),/permission denied/);
  } finally { await db.close(); }
});

test('trivia handler validates identity, quota and the listing, and rejects a malformed model response',async()=>{
  const id='11111111-1111-4111-8111-111111111111',listingId='33333333-3333-4333-8333-333333333333';
  let calls=0,quota=false,configured=true,validUser=true,listingFound=true,fields={};
  const handler=createHandler({env:key=>key==='OPENAI_API_KEY' ? (configured?'test-key':null) : 'test',
    createClient:()=>({auth:{getUser:async()=>({data:{user:validUser?{id}:null}})},
      from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>listingFound?{data:{title:'Item',description:'A description.',category:'Sports',attributes:{},evidence:''},error:null}:{data:null,error:new Error('not found')}})})})}),
      rpc:(name)=>{if(name==='consume_trivia_generation') return Promise.resolve({error:quota?new Error('limit'):null});
        if(name==='record_listing_trivia') return Promise.resolve({data:'44444444-4444-4444-8444-444444444444',error:null});
        if(name==='get_listing_trivia') return Promise.resolve({data:{id:'44444444-4444-4444-8444-444444444444',question:fields.question||'Q?',options:fields.options||['A','B','C','D']},error:null});
        return Promise.resolve({data:null,error:null});}}),
    fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fields)}]}]});}});
  const request=(body,auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});
  assert.equal((await handler(request({listing_id:listingId},false))).status,401);
  validUser=false;assert.equal((await handler(request({listing_id:listingId}))).status,401);validUser=true;
  configured=false;assert.equal((await handler(request({listing_id:listingId}))).status,503);configured=true;
  assert.equal((await handler(request({listing_id:'not-a-uuid'}))).status,400);
  listingFound=false;assert.equal((await handler(request({listing_id:listingId}))).status,404);listingFound=true;
  quota=true;assert.equal((await handler(request({listing_id:listingId}))).status,429);quota=false;
  assert.equal(calls,0);
  fields={question:'Only three options?',options:['A','B','C'],correct_index:0,explanation:'Because.'};
  assert.equal((await handler(request({listing_id:listingId}))).status,422);
  fields={question:'Out of range?',options:['A','B','C','D'],correct_index:9,explanation:'Because.'};
  assert.equal((await handler(request({listing_id:listingId}))).status,422);
  fields={question:'What matters?',options:['A','B','C','D'],correct_index:1,explanation:'Because B is documented.',price:5000,authenticity:'genuine'};
  const result=await handler(request({listing_id:listingId}));
  assert.equal(result.status,200);assert.equal(calls,3);
  const data=await result.json();
  assert.equal(data.question,'What matters?');
  assert.deepEqual(data.options,['A','B','C','D']);
  assert.equal('correct_index' in data,false);assert.equal('price' in data,false);
});
