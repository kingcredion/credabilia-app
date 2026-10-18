import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();

async function freshDb() {
  const db = new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text,created_at timestamptz not null default now());
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(p_secret text,p_name text,p_description text default null) returns uuid language plpgsql as $$
      declare new_id uuid; begin insert into vault.secrets(name,secret,description) values(p_name,p_secret,p_description) returning id into new_id; return new_id; end;$$;
    create function public.gen_random_bytes(p_len integer) returns bytea language sql as $$select decode(md5(random()::text||clock_timestamp()::text),'hex')$$;
    create schema net;
    create table net._http_calls(id serial primary key,url text,body jsonb,headers jsonb,called_at timestamptz default now());
    create function net.http_post(url text,body jsonb default null,headers jsonb default null,timeout_milliseconds integer default null) returns bigint
      language plpgsql as $$ declare new_id bigint; begin insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
  for (const file of MIGRATIONS) { const sql = await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, raw };
}

const SELLER = '33333333-3333-4333-8333-333333333333';

test('a seller stuck on Stripe setup gets the second reminder one day after the first, then the old 3-day spacing, capped at four messages', async () => {
  const { raw } = await freshDb();
  await raw('insert into auth.users(id,email) values($1,$2)', [SELLER, 'seller@example.test']);
  await raw("insert into public.listings(seller_id,title,description,category,price_cents,status) values($1,'Signed helmet','A fictional listing for testing only, with enough text to count as a description.','Sports',12500,'active')", [SELLER]);
  const sweep = async () => (await raw('select public.send_payout_setup_reminders() as n')).rows[0].n;
  const notice = async () => (await raw('select sent_count from public.payout_setup_notices where user_id=$1', [SELLER])).rows[0].sent_count;

  assert.equal(await notice(), 1, 'publishing records the first notice');
  assert.equal(await sweep(), 0, 'nothing is sent while the listing is under a day old');

  // 25 hours after publishing and after the first notice: the second reminder goes out.
  await raw("update public.listings set created_at=now()-interval '25 hours' where seller_id=$1", [SELLER]);
  await raw("update public.payout_setup_notices set last_sent_at=now()-interval '25 hours'");
  assert.equal(await sweep(), 1, 'second reminder after 24 hours');
  assert.equal(await notice(), 2);
  assert.equal(await sweep(), 0, 'and not twice in the same sweep window');

  // After that the spacing is three days: 25 hours is not enough, four days is.
  await raw("update public.payout_setup_notices set last_sent_at=now()-interval '25 hours'");
  assert.equal(await sweep(), 0, 'later reminders still wait three days');
  await raw("update public.payout_setup_notices set last_sent_at=now()-interval '4 days'");
  assert.equal(await sweep(), 1);
  assert.equal(await notice(), 3);

  // Capped at four messages in total.
  await raw("update public.payout_setup_notices set last_sent_at=now()-interval '4 days',sent_count=4");
  assert.equal(await sweep(), 0);
});

test('the migration patches the spacing clause and fails loudly if it ever stops matching', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610180158_payout_reminder_second_sooner.sql', import.meta.url), 'utf8');
  assert.match(sql, /raise exception 'send_payout_setup_reminders: spacing clause not found'/);
  assert.match(sql, /case when n\.sent_count=1 then interval ''24 hours'' else interval ''3 days'' end/);
});
