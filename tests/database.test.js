import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('database permissions, ownership, duplicate rewards and transaction rollback', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202609100001_foundation.sql', import.meta.url), 'utf8'));
    const seller = '11111111-1111-4111-8111-111111111111', auditor = '22222222-2222-4222-8222-222222222222';
    await db.query(`insert into auth.users(id,raw_user_meta_data) values ($1,'{"xp":99999,"full_name":"Seller"}'),($2,'{"full_name":"Auditor"}')`, [seller,auditor]);
    async function as(user, role='authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec(`set role ${role}`); }
    await as('', 'anon');
    assert.equal((await db.query('select * from public.browse_listings()')).rows.length, 0);
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/);
    await assert.rejects(db.query("select public.create_listing('Test item','A sufficiently long description','Art',100,'')"), /permission denied/);
    await as(seller);
    assert.equal((await db.query('select xp from public.user_progress')).rows[0].xp, 0);
    assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
    await assert.rejects(db.query('update public.account_permissions set can_audit=true'), /permission denied/);
    await assert.rejects(db.query('update public.user_progress set xp=1000'), /permission denied/);
    await assert.rejects(db.query("insert into public.audits(listing_id,auditor_id,verdict,explanation) values (gen_random_uuid(),auth.uid(),'authentic','A sufficiently long explanation')"), /permission denied/);
    const create = () => db.query("select public.create_listing('Test item','A sufficiently long description','Art',100,'Evidence unverified') as id");
    const id = (await create()).rows[0].id;
    assert.equal((await db.query('select seller_id from public.listings')).rows[0].seller_id,seller);
    const audit = listing => db.query("select public.submit_audit($1,'uncertain','More evidence is needed before a conclusion') as result",[listing]);
    await assert.rejects(audit(id), /own listing/);
    await assert.rejects(db.query("select public.create_listing('Bad','short','Art',0,'')"), /check constraint/);
    await as(auditor);
    assert.deepEqual((await audit(id)).rows[0].result,{xp_earned:5,already_submitted:false});
    assert.deepEqual((await audit(id)).rows[0].result,{xp_earned:0,already_submitted:true});
    assert.equal((await db.query('select xp from public.user_progress')).rows[0].xp,5);
    assert.equal((await db.query('select * from public.reward_events')).rows.length,1);
    await as(seller);
    assert.equal((await db.query('select * from public.audits')).rows.length,0);
    const second = (await create()).rows[0].id;
    await db.exec('reset role');
    await db.query('update public.account_permissions set can_audit=false where user_id=$1',[auditor]);
    await as(auditor);
    await assert.rejects(audit(second), /permission required/);
    await db.exec('reset role');
    await db.query('update public.account_permissions set can_audit=true where user_id=$1',[auditor]);
    await db.query('delete from public.user_progress where user_id=$1',[auditor]);
    await as(auditor);
    await assert.rejects(audit(second), /progress missing/);
    assert.equal((await db.query('select * from public.audits')).rows.length,1);
    assert.equal((await db.query('select * from public.reward_events')).rows.length,1);
  } finally { await db.close(); }
});
