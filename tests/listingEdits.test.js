import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {editableFields} from '../src/listingEdits.js';
test('seller edits reject foreign owners, stale changes and altered reviewed evidence',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;`);
 for(const file of ['202609100001_foundation.sql','202609110006_listing_edits.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await db.exec(`insert into auth.users(id) values ('${a}'),('${b}');set role authenticated;set request.jwt.claim.sub='${a}';select public.create_listing('Test item','A detailed description for our testing','Sports',100,'Original evidence');`);
 let item=(await db.query('select * from public.listings')).rows[0];
 const edit=(v,expected=item)=>db.query('select public.edit_listing($1,$2,$3,$4,$5,$6,$7)',[item.id,v.title,v.description,v.category,v.price_cents,v.evidence,editableFields(expected)]);
 await db.exec(`set request.jwt.claim.sub='${b}'`);await assert.rejects(edit({...item,price_cents:200}),/own listing/);
 await db.exec(`set request.jwt.claim.sub='${a}'`);await edit({...item,title:'Updated item',price_cents:200});await assert.rejects(edit({...item,price_cents:300}),/changed/);
 item=(await db.query('select * from public.listings')).rows[0];
 await assert.rejects(edit({...item,price_cents:0}),/check constraint/);
 await db.exec(`set request.jwt.claim.sub='${b}'`);await db.query("select public.submit_audit($1,'authentic','Evidence appears consistent in the photos')",[item.id]);
 await db.exec(`set request.jwt.claim.sub='${a}'`);await assert.rejects(edit({...item,description:'A changed description of a different object'}),/Only price/);await edit({...item,price_cents:300});
 assert.equal((await db.query('select count(*)::int as n from public.listings')).rows[0].n,1);
 await db.exec('reset role');assert.equal((await db.query('select xp from public.user_progress where user_id=$1',[b])).rows[0].xp,5);
 await db.exec(`update public.account_permissions set can_sell=false where user_id='${a}';set role authenticated;set request.jwt.claim.sub='${a}'`);await assert.rejects(edit(item),/Selling permission/);
 }finally{await db.close();}
});
