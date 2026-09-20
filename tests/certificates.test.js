import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { certificateInput, certificateSuggestion, resolveIssuer } from '../src/certificates.js';

test('issuer aliases resolve consistently and AI cannot supply lookup URLs or weights',()=>{
  assert.equal(resolveIssuer('PSA').id,resolveIssuer('PSA/DNA').id);
  assert.equal(resolveIssuer('Beckett').id,resolveIssuer('Beckett (BAS)').id);
  assert.equal(certificateSuggestion({issuer:'Beckett Authentication Services',certificate_number:'AB0952'}).certificate_issuer,'bas');
  assert.equal(certificateSuggestion({issuer:'PSA/DNA Authentication Services',certificate_number:'A109142'}).certificate_issuer,'psa');
  const suggestion=certificateSuggestion({issuer:'PSA',certificate_number:'00001234',lookup:'https://untrusted.example',rating:100});
  assert.equal(certificateInput(suggestion).certificate_number,'00001234');
  assert.equal(suggestion.lookup,undefined); assert.equal(suggestion.rating,undefined);
  assert.throws(()=>certificateInput({certificate_issuer:'psa',certificate_number:'https://bad.example'}));
  assert.throws(()=>certificateInput({certificate_issuer:'other',certificate_number:'123'}));
});

test('certificate metadata is validated atomically and returned to buyers',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for (const file of ['202609100001_foundation.sql','202609100002_certificates.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.exec(`insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
    const create=(issuer,number,company=null)=>db.query("select public.create_listing_with_certificate('Certificate test','A sufficiently detailed item description','Sports',100,'',$1,$2,$3)",[issuer,number,company]);
    await create('psa','00001234');
    for (const args of [['psa',null],['invented','123'],['other','123'],[null,'123'],['psa','123','Unexpected company']]) await assert.rejects(create(...args),/check constraint/);
    assert.equal((await db.query('select count(*)::int as n from public.listings')).rows[0].n,1);
    await assert.rejects(db.query("update public.listings set certificate_issuer='credabilia'"),/permission denied/);
    await db.exec('reset role;set role anon;');
    const rows=(await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items;
    assert.equal(rows[0].certificate_issuer,'psa'); assert.equal(rows[0].certificate_number,'00001234');
    await assert.rejects(create('psa','123'),/permission denied/);
  } finally { await db.close(); }
});
