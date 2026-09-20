import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { ISSUERS } from '../src/certificates.js';
import { credibilityScore } from '../src/credibility.js';

test('legacy blending thresholds and neutral smoothing',()=>{
  const item={certificate_issuer:'psa',certificate_number:'00001234'};
  assert.equal(credibilityScore(item).credibility_score,86);
  assert.equal(credibilityScore({}).certificate_supplied,false);
  assert.equal(credibilityScore({}).credibility_score,50);
  assert.equal(credibilityScore(item,[{verdict:'concerns'}]).community_score,42);
  assert.equal(credibilityScore(item,[{verdict:'uncertain'}]).community_score,50);
  for(const [count,weight] of [[0,80],[9,80],[10,65],[24,65],[25,50],[99,50],[100,35]]) {
    const result=credibilityScore(item,Array.from({length:count},()=>({verdict:'authentic',weight:999, xp:999})));
    assert.equal(result.certificate_weight,weight);
    assert.equal(result.community_weight+weight,100);
    assert.ok(result.credibility_score>=0 && result.credibility_score<=100);
  }
});

test('server and preview agree for all issuer ratings and every blend boundary',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    for(const issuer of ISSUERS) assert.equal((await db.query('select public.certificate_rating($1) as score',[issuer.id])).rows[0].score,issuer.rating);
    const owner='11111111-1111-4111-8111-111111111111';
    await db.query('insert into auth.users(id) values ($1)',[owner]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
    const id=(await db.query("select public.create_listing_with_certificate('PSA fixture','A fictional certificate scoring fixture.','Sports',100,'','psa','00001234',null) as id")).rows[0].id;
    await assert.rejects(db.query("select public.certificate_rating('psa')"),/permission denied/);
    const fixture={certificate_issuer:'psa',certificate_number:'00001234'};
    const audits=[];
    for(let count=0;count<=100;count++) {
      if([0,1,9,10,24,25,99,100].includes(count)) {
        await db.exec('reset role;set role anon;');
        const row=(await db.query('select public.browse_listings_with_certificates() as items')).rows[0].items[0];
        const expected=credibilityScore(fixture,audits);
        for(const key of Object.keys(expected)) assert.equal(row[key],expected[key],`${key} at ${count}`);
        assert.equal(row.auditor_id,undefined); assert.equal(row.explanation,undefined);
      }
      if(count===100) break;
      await db.exec('reset role');
      const userId=crypto.randomUUID();
      await db.query('insert into auth.users(id) values ($1)',[userId]);
      const verdict=['authentic','uncertain','concerns'][count%3];
      await db.query("insert into public.audits(listing_id,auditor_id,verdict,explanation) values ($1,$2,$3,'A fictional assessment for the scoring test.')",[id,userId,verdict]);
      audits.push({verdict});
    }
  } finally { await db.close(); }
});
