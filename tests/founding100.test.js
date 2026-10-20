import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();

async function freshDb() {
  const db = new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
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
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return {db, as, raw};
}

const ADDRESS = {name: 'Jamie Buyer', street1: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704', country: 'US'};
const OP = '00000000-0000-4000-8000-0000000000a1', S = '11111111-1111-4111-8111-111111111111', B1 = '22222222-2222-4222-8222-222222222222', B2 = '33333333-3333-4333-8333-333333333333';
let counter = 0;
const uid = () => '99999999-0000-4000-8000-' + String(++counter).padStart(12, '0');

async function member(raw, email, {verified = true} = {}) {
  const id = uid();
  await raw('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [id, email, verified ? new Date().toISOString() : null]);
  return id;
}

// A world with an operator, a seller, two buyers, and a finished auction ready to be paid for.
async function world() {
  const ctx = await freshDb(); const {db, as, raw} = ctx;
  await raw('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,now())', [OP, 'operator@example.test', S, 'seller@example.test', B1, 'buyer1@example.test', B2, 'buyer2@example.test']);
  await raw('insert into public.operators(user_id) values($1)', [OP]);
  for (const [id, fp] of [[B1, 'fp_b1_000001'], [B2, 'fp_b2_000002']]) await raw("insert into public.payment_fingerprints(user_id,kind,fingerprint) values($1,'card',$2)", [id, fp]);
  await as(S);
  await db.query('select public.save_shipping_address($1)', [{...ADDRESS, name: 'Sam Seller'}]);
  await db.query("select public.save_stripe_account('acct_test_seller')");
  await as(S, 'service_role');
  await db.query("select public.update_stripe_account_status('acct_test_seller',true,true)");
  let n = 0;
  ctx.sale = async (buyer = B1, {credit = 0, cents = 80000} = {}) => {
    n++;
    const path = S + `/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa${String(n).padStart(4, '0')}.png`;
    await as(S); await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
    const id = (await db.query("select public.create_listing_with_details('Signed helmet','A fictional listing for testing.','Sports',$1,'',null,null,null,$2,'{}','[]',40,12,12,12,false,p_listing_type=>'auction',p_auction_days=>5) as id", [cents, JSON.stringify([{path, kind: 'item'}])])).rows[0].id;
    await as(buyer); await db.query('select public.place_bid($1,$2)', [id, cents]);
    await db.exec("select set_config('app.auction_internal','1',false)");
    await raw("update public.listings set auction_ends_at=now()-interval '1 minute' where id=$1", [id]);
    await db.exec("select set_config('app.auction_internal','',false)");
    await as(S, 'service_role'); await db.query('select public.settle_ended_auctions()');
    await as(buyer);
    if (credit) await raw("insert into public.credit_events(user_id,amount_cents,reason) values($1,$2,'test')", [buyer, credit]);
    await as(buyer);
    const reservation = (await db.query('select public.reserve_listing_checkout($1,$2,$3) as r', [id, ADDRESS, credit])).rows[0].r;
    const session = 'cs_' + n;
    await db.query('select public.attach_stripe_checkout_session($1,$2)', [reservation.checkout_session_id, session]);
    await as(buyer, 'service_role'); await db.query('select public.finalize_checkout_session($1,$2)', [session, 'pi_' + n]);
    const purchase = (await raw('select price_cents,platform_fee_cents,selling_fee_waived,waived_selling_fee_cents,seller_payout_cents from public.purchases where stripe_checkout_session_id=$1', [session])).rows[0];
    return {reservation, purchase: Object.fromEntries(Object.entries(purchase).map(([k, v]) => [k, typeof v === 'string' ? Number(v) : v]))};
  };
  // Starts the campaign as the operator and loads invitations the way staff would.
  ctx.startCampaign = async () => { await as(OP); return (await db.query('select public.admin_start_founding_campaign() as r')).rows[0].r; };
  ctx.invite = async rows => { await as(OP); return (await db.query('select public.admin_founding_import($1) as r', [JSON.stringify(rows)])).rows[0].r; };
  ctx.claim = async who => { await as(who); return (await db.query('select public.claim_founding_spot() as r')).rows[0].r; };
  ctx.status = async who => { await as(who); return (await db.query('select public.founding_status() as r')).rows[0].r; };
  return ctx;
}

test('email matching ignores case, +tags and Gmail dots, and nothing else', async () => {
  const {raw} = await freshDb();
  const norm = async e => (await raw('select public.normalize_email($1) as e', [e])).rows[0].e;
  assert.equal(await norm('  Jane.Doe+Shop@Gmail.com '), 'janedoe@gmail.com');
  assert.equal(await norm('jane.doe@googlemail.com'), 'janedoe@gmail.com');
  assert.equal(await norm('Owner@Cards.COM'), 'owner@cards.com');
  assert.equal(await norm('first.last@cards.com'), 'first.last@cards.com', 'dots only matter-free for Gmail');
  assert.equal(await norm('a+b@cards.com'), 'a@cards.com');
  assert.equal(await norm('+only@cards.com'), '+only@cards.com', 'an address that is only a tag is left alone');
  assert.equal(await norm('not an email'), 'not an email');
  assert.equal(await norm(null), '');
});

test('the invitation list is private: no table access for anyone, and the staff functions are for operators only', async () => {
  const w = await world(); const {db, as} = w;
  const tables = ['founding_campaign', 'founding_invitations', 'founding_members'];
  for (const actor of [[B1, 'authenticated'], [null, 'anon']]) {
    for (const table of tables) { await as(actor[0], actor[1]); await assert.rejects(db.query(`select * from public.${table}`), /permission denied/, `${actor[1]} cannot read ${table}`); }
  }
  const staffCalls = ['select public.admin_start_founding_campaign()', "select public.admin_founding_import('[]')", 'select public.admin_founding_overview()', 'select public.admin_founding_invitations()'];
  for (const sql of staffCalls) { await as(B1); await assert.rejects(db.query(sql), /Operators only/, 'a member cannot: ' + sql); }
  for (const sql of [...staffCalls, 'select public.claim_founding_spot()', 'select public.founding_status()']) { await as(null, 'anon'); await assert.rejects(db.query(sql), /permission denied/, 'a visitor cannot: ' + sql); }
  await as(B1); await assert.rejects(db.query('select public.purge_expired_founding_invitations()'), /permission denied/);
  await as(B1); await assert.rejects(db.query('select public.founding_exempt($1)', [B1]), /permission denied/, 'members cannot ask about anyone else');
});

test('importing normalises, removes duplicates and bad addresses, and reports exact counts', async () => {
  const w = await world();
  const result = await w.invite([
    {email: 'Jane.Doe+shop@Gmail.com', name: 'Jane', business: 'Doe Cards', phone: '(555) 010-0001'},
    {email: 'janedoe@gmail.com', name: 'Jane again'},                 // same person once normalised
    {email: 'owner@cards.com', business: 'Cards Inc'},
    {email: 'OWNER@cards.com'},                                       // case duplicate
    {email: 'not-an-email'}, {email: ''}, {name: 'no email'},
    {email: 'second@shop.example', phone: '555'},
  ]);
  assert.deepEqual(result, {added: 3, duplicates: 2, invalid: 3, already_members: 0});
  const overview = (await (async () => { await w.as(OP); return (await w.db.query('select public.admin_founding_overview() as r')).rows[0].r; })());
  assert.equal(overview.invitations_loaded, 3);
  assert.equal(overview.invitations_open, 3);
  const again = await w.invite([{email: 'owner@cards.com'}]);
  assert.equal(again.added, 0, 'importing the same list twice adds nothing');
  assert.equal(again.duplicates, 1);
});

test('the window is 90 days from the moment staff start it, and nothing can be claimed before that', async () => {
  const w = await world();
  await w.invite([{email: 'seller@example.test'}]);
  await assert.rejects(w.claim(S), /not open yet/);
  assert.equal((await w.status(S)).open, false);
  const started = await w.startCampaign();
  assert.equal(started.window_days, 90);
  assert.equal(started.spot_limit, 100);
  const days = (new Date(started.expires_at) - new Date(started.started_at)) / 86400000;
  assert.equal(days, 90, 'exactly 90 days');
  await w.as(OP); await assert.rejects(w.db.query('select public.admin_start_founding_campaign()'), /already started/);
});

test('an invited, verified account gets the benefit; unverified, unlisted and expired attempts do not; a repeat request changes nothing', async () => {
  const w = await world(); const {raw} = w;
  const invitedUnverified = await member(raw, 'unverified@shop.example', {verified: false});
  const stranger = await member(raw, 'stranger@shop.example');
  await w.invite([{email: 'seller@example.test', name: 'Sam', business: 'Sam Sports', phone: '555-0100'}, {email: 'unverified@shop.example'}, {email: 'later@shop.example'}]);
  await w.startCampaign();

  const before = await w.status(S);
  assert.deepEqual({...before, expires_at: new Date(before.expires_at).toISOString()}, {member: false, spot_number: null, open: true, invited: true, spots_left: 100, expires_at: (await raw('select expires_at from public.founding_campaign')).rows[0].expires_at.toISOString()});
  await assert.rejects(w.claim(stranger), /no Founding 100 invitation/);
  assert.equal((await w.status(stranger)).invited, false, 'an uninvited account is not told anything about the list');
  await assert.rejects(w.claim(invitedUnverified), /Verify your email/);
  assert.equal((await w.status(invitedUnverified)).invited, false, 'an unverified email is never treated as invited');

  const first = await w.claim(S);
  assert.deepEqual(first, {claimed: true, already: false, spot_number: 1});
  const repeat = await w.claim(S);
  assert.deepEqual(repeat, {claimed: true, already: true, spot_number: 1}, 'a duplicate request reports the same spot');
  assert.equal((await raw('select claimed_count from public.founding_campaign')).rows[0].claimed_count, 1, 'and does not use a second spot');
  assert.equal((await raw('select count(*)::int as c from public.founding_members')).rows[0].c, 1);
  assert.equal((await raw('select count(*)::int as c from public.founding_invitations where email_normalized=$1', ['seller@example.test'])).rows[0].c, 0, 'the claimed contact is removed from the list');
  const kept = (await raw('select * from public.founding_members where user_id=$1', [S])).rows[0];
  assert.equal(Object.keys(kept).sort().join(), 'claimed_at,email_hash,spot_number,user_id', 'only the minimal claim record is kept');
  assert.doesNotMatch(JSON.stringify(kept), /seller@example|Sam Sports|555-0100/, 'no contact details in what remains');
  assert.equal((await w.status(S)).member, true);
});

test('Gmail-style variations of the invited address still match the verified account', async () => {
  const w = await world(); const {raw} = w;
  const jane = await member(raw, 'janedoe@gmail.com');
  await w.invite([{email: 'Jane.Doe+shop@gmail.com', name: 'Jane'}]);
  await w.startCampaign();
  assert.equal((await w.claim(jane)).spot_number, 1);
});

test('the benefit belongs to the account, so changing the email later cannot remove it', async () => {
  const w = await world(); const {raw, as, db} = w;
  await w.invite([{email: 'seller@example.test'}]); await w.startCampaign();
  await w.claim(S);
  await raw("update auth.users set email='something-else@example.test' where id=$1", [S]);
  await as(S, 'service_role');
  assert.equal((await db.query('select public.founding_exempt($1) as e', [S])).rows[0].e, true);
  assert.equal((await w.claim(S)).already, true);
  assert.equal((await w.status(S)).member, true);
  // and a different account that later takes over the old address gets nothing
  const heir = await member(raw, 'seller@example.test');
  await assert.rejects(w.claim(heir), /no Founding 100 invitation/);
});

test('the cap holds: the last spot goes to exactly one person, then the rest of the list is deleted at once', async () => {
  const w = await world(); const {raw, db, as} = w;
  const people = [];
  for (let i = 0; i < 4; i++) people.push(await member(raw, `p${i}@shop.example`));
  await w.invite(people.map((_, i) => ({email: `p${i}@shop.example`, name: 'P' + i, phone: '555-000' + i})).concat([{email: 'spare@shop.example'}]));
  await w.startCampaign();
  await raw('update public.founding_campaign set spot_limit=2');
  assert.equal((await w.claim(people[0])).spot_number, 1);
  assert.equal((await w.status(people[1])).spots_left, 1);
  assert.equal((await w.claim(people[1])).spot_number, 2);
  const camp = (await raw('select claimed_count,closed_reason,invitations_removed_unclaimed,invitations_loaded from public.founding_campaign')).rows[0];
  assert.equal(camp.claimed_count, 2);
  assert.equal(camp.closed_reason, 'full');
  assert.equal(camp.invitations_removed_unclaimed, 3, 'the three unclaimed contacts were deleted the moment the spots ran out');
  assert.equal((await raw('select count(*)::int as c from public.founding_invitations')).rows[0].c, 0);
  await assert.rejects(w.claim(people[2]), /All Founding 100 spots have been claimed/);
  assert.equal((await w.status(people[2])).open, false);
  await as(OP); await assert.rejects(db.query("select public.admin_founding_import('[{\"email\":\"x@y.example\"}]')"), /closed/);
});

test('two requests for the last spot cannot both win', async () => {
  const w = await world(); const {raw, db, as} = w;
  const a = await member(raw, 'a@shop.example'), b = await member(raw, 'b@shop.example');
  await w.invite([{email: 'a@shop.example'}, {email: 'b@shop.example'}]); await w.startCampaign();
  await raw('update public.founding_campaign set spot_limit=1');
  const results = [];
  for (const who of [a, b]) { try { results.push(await w.claim(who)); } catch (error) { results.push(error.message); } }
  assert.equal(results.filter(r => r.claimed).length, 1);
  assert.match(String(results.find(r => !r.claimed)), /All Founding 100 spots have been claimed/);
  assert.equal((await raw('select count(*)::int as c from public.founding_members')).rows[0].c, 1);
});

test('an expired invitation cannot be claimed even before cleanup runs; cleanup deletes only invitations, and claimed benefits survive', async () => {
  const w = await world(); const {raw, db, as} = w;
  const late = await member(raw, 'late@shop.example');
  await w.invite([{email: 'seller@example.test'}, {email: 'late@shop.example', name: 'Late', phone: '555-0199'}, {email: 'never@shop.example', phone: '555-0200'}]);
  await w.startCampaign();
  await w.claim(S);
  const accountsBefore = (await raw('select count(*)::int as c from auth.users')).rows[0].c;

  // The window ends. The scheduled cleanup has NOT run yet.
  await raw("update public.founding_campaign set started_at=now()-interval '91 days', expires_at=now()-interval '1 day'");
  await assert.rejects(w.claim(late), /window has closed/, 'the server refuses it on its own');
  assert.equal((await w.status(late)).open, false);
  assert.equal((await raw('select count(*)::int as c from public.founding_invitations')).rows[0].c, 2, 'the two unclaimed invitations are still stored until cleanup');

  await as(S, 'service_role');
  assert.equal((await db.query('select public.purge_expired_founding_invitations() as n')).rows[0].n, 2);
  assert.equal((await raw('select count(*)::int as c from public.founding_invitations')).rows[0].c, 0, 'unclaimed contacts and their details are gone');
  const camp = (await raw('select closed_reason,invitations_removed_unclaimed,claimed_count from public.founding_campaign')).rows[0];
  assert.deepEqual([camp.closed_reason, camp.invitations_removed_unclaimed, camp.claimed_count], ['expired', 2, 1]);
  assert.equal((await raw('select count(*)::int as c from auth.users')).rows[0].c, accountsBefore, 'no account was deleted');
  assert.equal((await raw('select count(*)::int as c from public.founding_members where user_id=$1', [S])).rows[0].c, 1, 'the claimed benefit is untouched');
  await as(S, 'service_role');
  assert.equal((await db.query('select public.founding_exempt($1) as e', [S])).rows[0].e, true);
  assert.equal((await db.query('select public.purge_expired_founding_invitations() as n')).rows[0].n, 0, 'running it again is harmless');
  await as(OP); await assert.rejects(db.query("select public.admin_founding_import('[{\"email\":\"x@y.example\"}]')"), /closed/);
});

test('cleanup does nothing while the window is still open', async () => {
  const w = await world(); const {db, as, raw} = w;
  await w.invite([{email: 'a@shop.example'}]); await w.startCampaign();
  await as(S, 'service_role');
  assert.equal((await db.query('select public.purge_expired_founding_invitations() as n')).rows[0].n, 0);
  assert.equal((await raw('select count(*)::int as c from public.founding_invitations')).rows[0].c, 1);
});

test('the admin view shows invited, claimed and removed counts privately, plus the exact dates', async () => {
  const w = await world(); const {db, as} = w;
  await w.invite([{email: 'seller@example.test', business: 'Sam Sports'}, {email: 'b@shop.example', business: 'B Shop', phone: '555-0101'}]);
  const started = await w.startCampaign();
  await w.claim(S);
  await as(OP);
  const o = (await db.query('select public.admin_founding_overview() as r')).rows[0].r;
  assert.equal(o.invitations_loaded, 2); assert.equal(o.invitations_open, 1); assert.equal(o.claimed, 1); assert.equal(o.spots_left, 99);
  assert.equal(o.expires_at, started.expires_at); assert.equal(o.members.length, 1); assert.equal(o.members[0].spot_number, 1);
  const list = (await db.query("select public.admin_founding_invitations('shop') as r")).rows[0].r;
  assert.equal(list.length, 1); assert.equal(list[0].business_name, 'B Shop'); assert.equal(list[0].phone, '555-0101');
});

test('FEES: an ordinary seller is charged exactly as before; a Founding seller pays no selling fee, only a separate payment-processing amount', async () => {
  const w = await world();
  const ordinary = await w.sale(B1);
  assert.deepEqual(ordinary.purchase, {price_cents: 80000, platform_fee_cents: 10920, selling_fee_waived: false, waived_selling_fee_cents: 0, seller_payout_cents: 69080},
    'unchanged: 13.6% + 40c, nothing waived');

  await w.invite([{email: 'seller@example.test'}]); await w.startCampaign(); await w.claim(S);
  const founder = await w.sale(B2);
  assert.equal(founder.purchase.selling_fee_waived, true);
  assert.equal(founder.purchase.waived_selling_fee_cents, 10920, 'records the selling fee that was waived');
  assert.equal(founder.purchase.platform_fee_cents, 2350, 'what is withheld is only the processing pass-through: 2.9% + 30c of $800');
  assert.equal(founder.purchase.seller_payout_cents, 77650, 'the seller keeps the price minus processing only');
  assert.ok(founder.purchase.seller_payout_cents > ordinary.purchase.seller_payout_cents);
});

test('FEES: processing is passed through even on a small sale, so Credabilia never pays Stripe on a founder sale', async () => {
  const w = await world();
  await w.invite([{email: 'seller@example.test'}]); await w.startCampaign(); await w.claim(S);
  const small = await w.sale(B1, {cents: 100});
  assert.equal(small.purchase.platform_fee_cents, 33, '$1.00 -> 3c + 30c');
  assert.equal(small.purchase.seller_payout_cents, 67);
  assert.equal(small.purchase.waived_selling_fee_cents, 44, 'the waived selling fee on $1.00 was 14c + 30c');
});

test('FEES: Credion Coins cannot be spent on a Founding seller\'s sale, because the platform earns no selling fee to fund them', async () => {
  const w = await world();
  const ordinary = await w.sale(B1, {credit: 5000});
  assert.equal(Number(ordinary.reservation.applied_credit_cents), 5000, 'an ordinary sale still accepts coins (up to the fee)');
  await w.invite([{email: 'seller@example.test'}]); await w.startCampaign(); await w.claim(S);
  const founder = await w.sale(B2, {credit: 5000});
  assert.equal(Number(founder.reservation.applied_credit_cents), 0, 'no coins are paid out of a fee that was waived');
});

test('FEES: the monthly auditor reward pool counts only real selling fees, never a waived sale\'s processing pass-through', async () => {
  const w = await world(); const {raw} = w;
  await w.sale(B1);                                                                                   // ordinary: fee 10920
  await w.invite([{email: 'seller@example.test'}]); await w.startCampaign(); await w.claim(S);
  await w.sale(B2);                                                                                   // founder: waived
  await raw("update public.purchases set created_at=date_trunc('month',now())-interval '10 days'");   // both sales fall in last month
  await raw('select public.run_monthly_auditor_rewards()');
  const run = (await raw('select pool_cents from public.reward_pool_runs')).rows[0];
  assert.equal(Number(run.pool_cents), Math.round(10920 * 0.05), 'only the ordinary seller\'s fee feeds the pool');
});

test('FEES: every place a purchase\'s fee is decided is covered, and the badge or any client value never decides eligibility', async () => {
  const {raw} = await freshDb();
  // The only function that writes a purchase row decides the fee from the membership table.
  const finalize = (await raw("select pg_get_functiondef('public.finalize_checkout_session(text,text)'::regprocedure) as d")).rows[0].d;
  assert.match(finalize, /founding_exempt\(target\.seller_id\)/);
  assert.equal((finalize.match(/platform_fee_cents\(target\.price_cents\)/g) || []).length >= 2, true);
  const writers = (await raw("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ilike '%insert into public.purchases%'")).rows.map(r => r.proname);
  assert.deepEqual(writers, ['finalize_checkout_session'], 'no other function can create a purchase with its own fee');
  const readers = (await raw("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ilike '%platform_fee_cents(%' order by proname")).rows.map(r => r.proname);
  assert.deepEqual(readers, ['finalize_checkout_session', 'reserve_listing_checkout'], 'the fee formula is only used by checkout creation and finalization');
});

test('"founding" cannot be taken as a store name, because /founding is the claim page', async () => {
  const w = await world(); const {db, as} = w;
  await as(B1);
  await assert.rejects(db.query("select public.update_store_slug('founding')"), /reserved/);
  await as(B1); await db.query("select public.update_store_slug('giveaway-rules-fans')").catch(() => {});
  await assert.rejects((async () => { await as(B1); await db.query("select public.update_store_slug('giveaway-rules')"); })(), /reserved/, 'the earlier reserved names still work');
});
