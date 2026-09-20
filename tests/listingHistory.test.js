import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('substantive edits after an audit archive history, reset the score, and let auditors re-review',async()=>{
  const db=new PGlite();
  const seller='11111111-1111-4111-8111-111111111111',auditor='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;`);
    for(const file of ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609190011_listing_history.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[seller,auditor]);
    async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);}
    const editArgs=(id,title,description,category,price,evidence,issuer,number,company,media,expected)=>
      [id,title,description,category,price,evidence,issuer,number,company,media===null?null:JSON.stringify(media),JSON.stringify(expected)];
    const edit=(...args)=>db.query('select public.edit_listing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',editArgs(...args));

    await as(seller);
    const listingId=(await db.query("select public.create_listing('Original title','A fictional description for testing.','Sports',1000,'') as id")).rows[0].id;
    const expectedV1={title:'Original title',description:'A fictional description for testing.',category:'Sports',price_cents:1000,evidence:''};

    // Certificate and media are editable even before any audit -- closes the original gap.
    await edit(listingId,'Original title','A fictional description for testing.','Sports',1000,'','psa','00001234',null,null,expectedV1);
    assert.equal((await db.query('select certificate_number,version from public.listings where id=$1',[listingId])).rows[0].certificate_number,'00001234');
    assert.equal((await db.query('select certificate_number,version from public.listings where id=$1',[listingId])).rows[0].version,1);

    await as(auditor);
    await db.query("select public.submit_audit($1,'concerns','I see something concerning about this listing right now.')",[listingId]);
    assert.equal((await db.query('select credibility_score,credibility_audit_count from jsonb_to_recordset(public.browse_listings_with_certificates()) as x(id uuid,credibility_score int,credibility_audit_count int) where id=$1',[listingId])).rows[0].credibility_audit_count,1);

    await as(seller);
    const expectedWithCert={title:'Original title',description:'A fictional description for testing.',category:'Sports',price_cents:1000,evidence:''};
    // Price-only change after an audit must NOT bump the version or touch history.
    await edit(listingId,'Original title','A fictional description for testing.','Sports',1500,'','psa','00001234',null,null,expectedWithCert);
    assert.equal((await db.query('select version from public.listings where id=$1',[listingId])).rows[0].version,1);
    assert.deepEqual((await db.query('select public.get_listing_history($1) as h',[listingId])).rows[0].h,[]);

    // A substantive change (title) after an audit archives it and resets the score.
    const expectedBeforeTitleEdit={title:'Original title',description:'A fictional description for testing.',category:'Sports',price_cents:1500,evidence:''};
    await edit(listingId,'Corrected title','A fictional description for testing.','Sports',1500,'','psa','00001234',null,null,expectedBeforeTitleEdit);
    const listing=(await db.query('select version,title from public.listings where id=$1',[listingId])).rows[0];
    assert.equal(listing.version,2);
    assert.equal(listing.title,'Corrected title');

    const browsed=(await db.query("select id,credibility_audit_count,credibility_score from jsonb_to_recordset(public.browse_listings_with_certificates()) as x(id uuid,credibility_audit_count int,credibility_score int) where id=$1",[listingId])).rows[0];
    assert.equal(browsed.credibility_audit_count,0);

    const history=(await db.query('select public.get_listing_history($1) as h',[listingId])).rows[0].h;
    assert.equal(history.length,1);
    assert.equal(history[0].version,1);
    assert.equal(history[0].title,'Original title');
    assert.equal(history[0].audits.length,1);
    assert.equal(history[0].audits[0].verdict,'concerns');

    // The same auditor, blocked as "already submitted" against the old version, can review the new one.
    await as(auditor);
    const result=(await db.query("select public.submit_audit($1,'authentic','Looks fine to me after the correction was made.') as r",[listingId])).rows[0].r;
    assert.equal(result.already_submitted,false);
    assert.equal(result.xp_earned,5);
  } finally { await db.close(); }
});
