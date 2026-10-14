import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
const ADDRESS = {name:'Pat Winner',street1:'1 Prize Way',city:'Austin',state:'TX',zip:'78701'};

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
      language plpgsql as $$ declare new_id bigint; begin
        if coalesce(headers->>'Content-Type','application/json')<>'application/json' then raise exception 'Content-Type header must be "application/json"'; end if;
        insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
  for (const file of MIGRATIONS) { const sql = await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(sql)) continue; await db.exec(sql); }
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

let n = 0;
const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');

async function member(raw, {email, name, ready = false} = {}) {
  const uid = id();
  await raw('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [uid, email ?? uid.slice(-5) + '@example.test', JSON.stringify(name ? {full_name: name} : {})]);
  if (ready) await raw('insert into public.stripe_accounts(user_id,stripe_account_id,charges_enabled) values($1,$2,true)', [uid, 'acct_' + uid.slice(-8)]);
  return uid;
}
const makeReady = (raw, uid) => raw('insert into public.stripe_accounts(user_id,stripe_account_id,charges_enabled) values($1,$2,true) on conflict (user_id) do update set charges_enabled=true', [uid, 'acct_' + uid.slice(-8)]);
async function listing(raw, seller, {status = 'active', ageDays = 0, title = 'Signed jersey'} = {}) {
  const r = await raw("insert into public.listings(seller_id,title,description,category,price_cents,status,created_at) values($1,$2,'A fictional listing for testing only.','Sports',50000,$3,now()-($4||' days')::interval) returning id", [seller, title, status, String(ageDays)]);
  return r.rows[0].id;
}

// A world with a King (operator) who owns the prize jersey. The giveaway's start is moved 30 days back so listings and referrals made "days ago" fall inside its window.
async function world({started = false} = {}) {
  const ctx = await freshDb();
  await ctx.raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
  const king = await member(ctx.raw, {email: 'king@example.test'});
  await ctx.raw('insert into public.operators(user_id) values($1)', [king]);
  await ctx.raw("insert into public.stripe_accounts(user_id,stripe_account_id,charges_enabled) values($1,'acct_king',true)", [king]); // the King can take payments, so the unpaid-seller rule does not interfere
  const prize = await listing(ctx.raw, king, {title: 'Mike Vick signed jersey'});
  let giveaway = null;
  if (started) giveaway = await start(ctx, king, prize);
  await ctx.raw('delete from net._http_calls');
  return {...ctx, king, prize, giveaway};
}
async function start({db, as, raw}, king, prize) {
  await as(king);
  const res = await db.query('select public.admin_start_giveaway($1) as id', [prize]);
  await raw("update public.giveaways set starts_at=now()-interval '30 days' where id=$1", [res.rows[0].id]);
  return res.rows[0].id;
}

const events = async raw => (await raw("select body->'data'->'attributes'->'metric'->'data'->'attributes'->>'name' as name from net._http_calls order by id")).rows.map(r => r.name);
async function ticketsOf(raw, giveaway, user) {
  const r = await raw('select * from public.giveaway_ticket_rows($1,$2)', [giveaway, user]);
  return r.rows[0];
}
async function enter(db, as, uid, state = 'TX') { await as(uid); return (await db.query('select public.enter_giveaway($1) as g', [state])).rows[0].g; }

test('only an operator can start a giveaway, only on a King\'s Collection item, and only one at a time', async () => {
  const {db, as, raw, king, prize} = await world();
  const other = await member(raw, {email: 'seller@example.test'});
  const ordinary = await listing(raw, other);
  await as(other);
  await assert.rejects(db.query('select public.admin_start_giveaway($1)', [prize]), /Only an operator/);
  await as(king);
  await assert.rejects(db.query('select public.admin_start_giveaway($1)', [ordinary]), /King's Collection/);
  const first = (await db.query('select public.admin_start_giveaway($1) as id', [prize])).rows[0].id;
  const g = (await raw('select ends_at, starts_at, status from public.giveaways where id=$1', [first])).rows[0];
  const days = (new Date(g.ends_at) - new Date(g.starts_at)) / 86400000;
  assert.ok(days > 180 && days < 186, 'default end date is about six months out, got ' + days);
  const second = await listing(raw, king, {title: 'Second prize'});
  await as(king);
  await assert.rejects(db.query('select public.admin_start_giveaway($1)', [second]), /already running/);
  await db.query('select public.admin_cancel_giveaway($1)', [first]);
  await db.query('select public.admin_start_giveaway($1)', [second]); // the switch works again once the first is off
});

test('a giveaway cannot start while the item has a purchase in progress, or for an auction', async () => {
  const {db, as, raw, king, prize} = await world();
  const buyer = await member(raw, {email: 'buyer@example.test'});
  await raw("insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 day')", [prize, buyer, king]);
  await as(king);
  await assert.rejects(db.query('select public.admin_start_giveaway($1)', [prize]), /purchase in progress/);
  await raw("delete from public.availability_requests");
  await raw("update public.listings set listing_type='auction', auction_ends_at=now()+interval '1 day' where id=$1", [prize]);
  await as(king);
  await assert.rejects(db.query('select public.admin_start_giveaway($1)', [prize]), /fixed-price/);
});

test('while the prize is a giveaway nobody can request, check out, or bid on it; switching it off restores normal buying', async () => {
  const {db, as, raw, king, prize, giveaway} = await world({started: true});
  const buyer = await member(raw, {email: 'buyer@example.test'});
  const tryAll = async () => {
    await assert.rejects(raw("insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 day')", [prize, buyer, king]), /giveaway prize/);
    await assert.rejects(raw("insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at) values($1,$2,$3,50000,now()+interval '1 hour')", [prize, buyer, king]), /giveaway prize/);
    await assert.rejects(raw("insert into public.bids(listing_id,bidder_id,amount_cents) values($1,$2,60000)", [prize, buyer]), /giveaway prize/);
  };
  await tryAll();
  await as(king);
  await db.query('select public.admin_cancel_giveaway($1)', [giveaway]);
  await raw("insert into public.availability_requests(listing_id,buyer_id,seller_id,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 day')", [prize, buyer, king]);
  await raw('delete from public.availability_requests');
  // a prize that has been drawn stays off the market
  await raw("update public.giveaways set status='drawn' where id=$1", [giveaway]);
  await tryAll();
});

test('entering: needs a member in good standing, is idempotent, and an entry only counts once Stripe setup is finished', async () => {
  const {db, as, raw, king, giveaway} = await world({started: true});
  const alex = await member(raw, {email: 'alex@example.test'});
  const state = await enter(db, as, alex);
  assert.equal(state.me.entered, true);
  assert.equal(state.me.ready, false);
  assert.equal(state.me.tickets, 0);
  assert.equal(state.entrants, 0);
  assert.equal(state.pending_entrants, 1);
  await enter(db, as, alex); // second tap changes nothing
  assert.equal((await raw('select count(*)::int as c from public.giveaway_entries where giveaway_id=$1', [giveaway])).rows[0].c, 1);
  await makeReady(raw, alex);
  await as(alex);
  const after = (await db.query('select public.current_giveaway() as g')).rows[0].g;
  assert.equal(after.me.ready, true);
  assert.equal(after.me.tickets, 1);
  assert.equal(after.entrants, 1);
  assert.equal(after.tickets, 1);
  // not allowed: operators, the App Review account, banned members, signed-out visitors
  const review = await member(raw, {email: 'appreview@credabilia.com'});
  const banned = await member(raw, {email: 'banned@example.test'});
  await raw('update public.profiles set banned_at=now() where id=$1', [banned]);
  for (const who of [king, review, banned]) { await as(who); await assert.rejects(db.query("select public.enter_giveaway('TX')"), /cannot enter/); }
  await as(null, 'anon');
  await assert.rejects(db.query("select public.enter_giveaway('TX')"), /permission denied/);
});

test('tickets: 1 for entering, +1 per listing live 7 days (no cap), nothing for new, held, archived or earlier listings, +1 per Stripe-ready referral', async () => {
  const {db, as, raw, giveaway} = await world({started: true});
  const sam = await member(raw, {email: 'sam@example.test', ready: true});
  await enter(db, as, sam);
  for (let i = 0; i < 7; i++) await listing(raw, sam, {ageDays: 8 + i}); // seven aged listings: no cap
  await listing(raw, sam, {ageDays: 3});                                   // too new
  await listing(raw, sam, {ageDays: 20, status: 'archived'});              // removed
  await listing(raw, sam, {ageDays: 20, status: 'needs_review'});          // held
  await listing(raw, sam, {ageDays: 20, status: 'draft'});                 // never published
  await listing(raw, sam, {ageDays: 40});                                  // made before the giveaway started
  const ready = await member(raw, {email: 'friend1@example.test', ready: true});
  const notReady = await member(raw, {email: 'friend2@example.test'});
  for (const f of [ready, notReady]) { await as(f); assert.equal((await db.query('select public.claim_referral(null,$1) as ok', [(await raw('select referral_code from public.profiles where id=$1', [sam])).rows[0].referral_code ?? 'x'])).rows[0].ok, false); }
  await as(sam); const info = (await db.query('select public.my_referral_info() as i')).rows[0].i;
  for (const f of [ready, notReady]) { await as(f); assert.equal((await db.query('select public.claim_referral(null,$1) as ok', [info.code])).rows[0].ok, true); }
  const t = await ticketsOf(raw, giveaway, sam);
  assert.equal(t.listings, 7);
  assert.equal(t.referrals, 1);
  assert.equal(t.tickets, 1 + 7 + 1);
  await as(sam); const later = (await db.query('select public.my_referral_info() as i')).rows[0].i;
  assert.deepEqual([later.signed_up, later.verified].map(Number), [2, 1]);
  // a member who is not Stripe-ready keeps their counts but earns no tickets until they finish setup
  const quiet = await member(raw, {email: 'quiet@example.test'});
  await enter(db, as, quiet); await listing(raw, quiet, {ageDays: 10});
  const q = await ticketsOf(raw, giveaway, quiet);
  assert.equal(q.listings, 1); assert.equal(q.tickets, 0);
  // removing a listing takes its ticket away by itself
  await raw("update public.listings set status='archived' where seller_id=$1 and created_at<now()-interval '14 days' and status='active'", [sam]);
  assert.equal((await ticketsOf(raw, giveaway, sam)).listings, 6); // the 14-day-old one was removed, so one ticket fewer
  await raw("update public.listings set status='archived' where seller_id=$1", [sam]);
  assert.equal((await ticketsOf(raw, giveaway, sam)).listings, 0);
});

test('referrals: first touch only, never yourself, only brand-new members, works by storefront name or code', async () => {
  const {db, as, raw} = await world({started: true});
  const host = await member(raw, {email: 'host@example.test', ready: true});
  const other = await member(raw, {email: 'other@example.test'});
  await as(host); await db.query("select public.update_store_slug('hostshop')");
  const code = (await db.query('select public.my_referral_info() as i')).rows[0].i.code;
  assert.match(code, /^[0-9a-f]{8}$/);
  assert.equal((await db.query('select public.my_referral_info() as i')).rows[0].i.code, code); // stable
  await as(host); assert.equal((await db.query("select public.claim_referral('hostshop') as ok")).rows[0].ok, false); // not yourself
  const joiner = await member(raw, {email: 'joiner@example.test'});
  await as(joiner);
  assert.equal((await db.query("select public.claim_referral('nobody-here') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select public.claim_referral('HostShop') as ok")).rows[0].ok, true);
  await as(other); await db.query('select public.my_referral_info()');
  const otherCode = (await raw('select referral_code from public.profiles where id=$1', [other])).rows[0].referral_code;
  await as(joiner); assert.equal((await db.query('select public.claim_referral(null,$1) as ok', [otherCode])).rows[0].ok, false); // first touch wins
  assert.equal((await raw('select referred_by from public.profiles where id=$1', [joiner])).rows[0].referred_by, host);
  const veteran = await member(raw, {email: 'veteran@example.test'});
  await raw("update public.profiles set created_at=now()-interval '10 days' where id=$1", [veteran]);
  await as(veteran); assert.equal((await db.query("select public.claim_referral('hostshop') as ok")).rows[0].ok, false); // not a new member
});

test('the draw is weighted by tickets', async () => {
  const {raw, giveaway, db, as} = await world({started: true});
  const heavy = await member(raw, {email: 'heavy@example.test', ready: true});
  const light = await member(raw, {email: 'light@example.test', ready: true});
  await enter(db, as, heavy); await enter(db, as, light);
  for (let i = 0; i < 8; i++) await listing(raw, heavy, {ageDays: 9 + i}); // heavy: 9 tickets, light: 1
  let heavyWins = 0; const runs = 400;
  for (let i = 0; i < runs; i++) if ((await raw('select public.giveaway_pick($1) as w', [giveaway])).rows[0].w.id === heavy) heavyWins++;
  assert.ok(heavyWins > runs * 0.8 && heavyWins < runs, `expected about 90% for the heavy entrant, got ${heavyWins}/${runs}`);
  assert.equal((await raw('select public.giveaway_pick($1,$2) as w', [giveaway, heavy])).rows[0].w.id, light); // alternate excludes the winner
});

test('the automatic draw: picks a ready winner and an alternate, ignores members who lost Stripe readiness, emails them, and closes the giveaway', async () => {
  const {raw, db, as, giveaway, prize} = await world({started: true});
  const a = await member(raw, {email: 'a@example.test', name: 'Ann', ready: true});
  const b = await member(raw, {email: 'b@example.test', name: 'Bo', ready: true});
  const c = await member(raw, {email: 'c@example.test', name: 'Cy', ready: true});
  for (const u of [a, b, c]) await enter(db, as, u);
  await raw('update public.stripe_accounts set charges_enabled=false where user_id=$1', [c]); // no longer ready at draw time
  await raw('delete from net._http_calls');
  assert.deepEqual((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r, {drawn: 0, passed_to_alternate: 0}); // not due yet
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  assert.equal((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r.drawn, 1);
  const winners = (await raw('select user_id, place, status from public.giveaway_winners where giveaway_id=$1 order by place', [giveaway])).rows;
  assert.equal(winners.length, 2);
  assert.deepEqual(winners.map(w => w.status), ['notified', 'pending']);
  assert.ok([a, b].includes(winners[0].user_id) && [a, b].includes(winners[1].user_id) && winners[0].user_id !== winners[1].user_id);
  assert.equal((await raw('select status from public.giveaways where id=$1', [giveaway])).rows[0].status, 'drawn');
  assert.ok((await events(raw)).includes('Giveaway Won'));
  assert.ok((await events(raw)).includes('Admin Alert: Giveaway Drawn'));
  assert.equal((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r.drawn, 0); // never draws twice
  await as(winners[0].user_id);
  const win = (await db.query('select public.my_giveaway_win() as w')).rows[0].w;
  assert.equal(win.title, 'Mike Vick signed jersey'); assert.equal(win.status, 'notified'); assert.equal(win.listing_id, prize);
});

test('the winner email event carries the prize title, a readable claim date and the app link', async () => {
  const {raw, db, as, giveaway} = await world({started: true});
  const m = await member(raw, {email: 'win@example.test', ready: true});
  await enter(db, as, m);
  await raw('delete from net._http_calls');
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  const e = (await raw("select body->'data'->'attributes'->'properties' as p, body->'data'->'attributes'->'profile'->'data'->'attributes'->>'email' as email from net._http_calls where body->'data'->'attributes'->'metric'->'data'->'attributes'->>'name'='Giveaway Won'")).rows;
  assert.equal(e.length, 1);
  assert.equal(e[0].email, 'win@example.test');
  assert.equal(e[0].p.title, 'Mike Vick signed jersey');
  assert.match(e[0].p.claim_deadline_display, /^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  assert.equal(e[0].p.action_url, 'https://credabilia.com/');
});

test('a draw with no valid entries closes quietly', async () => {
  const {raw, giveaway} = await world({started: true});
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  assert.equal((await raw('select count(*)::int as c from public.giveaway_winners')).rows[0].c, 0);
  assert.equal((await raw('select status from public.giveaways where id=$1', [giveaway])).rows[0].status, 'drawn');
});

test('an unclaimed prize passes to the alternate, then is forfeited; a winner claims with an address once Stripe-ready', async () => {
  const {raw, db, as, giveaway} = await world({started: true});
  const a = await member(raw, {email: 'a@example.test', ready: true});
  const b = await member(raw, {email: 'b@example.test', ready: true});
  await enter(db, as, a); await enter(db, as, b);
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  const first = (await raw('select user_id from public.giveaway_winners where giveaway_id=$1 and place=1', [giveaway])).rows[0].user_id;
  const second = first === a ? b : a;
  const stranger = await member(raw, {email: 'stranger@example.test', ready: true});
  await as(stranger); await assert.rejects(db.query('select public.claim_giveaway_prize($1)', [ADDRESS]), /no prize waiting/);
  await as(second); await assert.rejects(db.query('select public.claim_giveaway_prize($1)', [ADDRESS]), /no prize waiting/); // the alternate has not been called up
  // winner does not claim in 14 days: it goes to the alternate
  await raw("update public.giveaway_winners set claim_deadline=now()-interval '1 minute' where giveaway_id=$1 and place=1", [giveaway]);
  await raw('delete from net._http_calls');
  assert.equal((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r.passed_to_alternate, 1);
  const rows = (await raw('select place, status from public.giveaway_winners where giveaway_id=$1 order by place', [giveaway])).rows;
  assert.deepEqual(rows.map(r => r.status), ['forfeited', 'notified']);
  assert.ok((await events(raw)).includes('Giveaway Won'));
  await as(first); await assert.rejects(db.query('select public.claim_giveaway_prize($1)', [ADDRESS]), /no prize waiting/);
  await as(second);
  await assert.rejects(db.query('select public.claim_giveaway_prize($1)', [{name: 'X'}]), /delivery address/);
  await raw('update public.stripe_accounts set charges_enabled=false where user_id=$1', [second]);
  await as(second); await assert.rejects(db.query('select public.claim_giveaway_prize($1)', [ADDRESS]), /payout setup/);
  await makeReady(raw, second);
  await as(second); await db.query('select public.claim_giveaway_prize($1)', [ADDRESS]);
  const claimed = (await raw('select status, shipping_address from public.giveaway_winners where user_id=$1', [second])).rows[0];
  assert.equal(claimed.status, 'claimed'); assert.equal(claimed.shipping_address.city, 'Austin');
  assert.ok((await events(raw)).includes('Admin Alert: Giveaway Prize Claimed'));
  // nobody else is waiting: a later sweep does not forfeit a claimed prize
  await raw("update public.giveaway_winners set claim_deadline=now()-interval '1 minute' where user_id=$1", [second]);
  await raw('select public.run_giveaway_maintenance()');
  assert.equal((await raw('select status from public.giveaway_winners where user_id=$1', [second])).rows[0].status, 'claimed');
});

test('if the alternate is not ready either, the prize is forfeited and the operator is told', async () => {
  const {raw, db, as, giveaway} = await world({started: true});
  const a = await member(raw, {email: 'a@example.test', ready: true});
  const b = await member(raw, {email: 'b@example.test', ready: true});
  await enter(db, as, a); await enter(db, as, b);
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  await raw('update public.stripe_accounts set charges_enabled=false');
  await raw("update public.giveaway_winners set claim_deadline=now()-interval '1 minute' where place=1");
  await raw('delete from net._http_calls');
  await raw('select public.run_giveaway_maintenance()');
  assert.deepEqual((await raw('select status from public.giveaway_winners order by place')).rows.map(r => r.status), ['forfeited', 'forfeited']);
  assert.ok((await events(raw)).includes('Admin Alert: Giveaway Drawn'));
});

test('permissions: the card is public, admin tools are operator-only, draw tools and tables are locked down', async () => {
  const {db, as, raw, king, giveaway} = await world({started: true});
  const m = await member(raw, {email: 'm@example.test'});
  await as(null, 'anon');
  assert.equal((await db.query('select public.current_giveaway() as g')).rows[0].g.me, null);
  await as(m, 'authenticated');
  await assert.rejects(db.query('select public.admin_giveaway_overview()'), /Only an operator/);
  await assert.rejects(db.query('select public.admin_cancel_giveaway($1)', [giveaway]), /Only an operator/);
  for (const sql of ['select public.draw_giveaway($1)', 'select public.run_giveaway_maintenance()', 'select * from public.giveaway_ticket_rows($1)', 'select public.giveaway_pick($1)']) {
    await as(m); await assert.rejects(db.query(sql, sql.includes('$1') ? [giveaway] : []), /permission denied/);
  }
  for (const t of ['giveaways', 'giveaway_entries', 'giveaway_winners']) { await as(m); await assert.rejects(db.query('select * from public.' + t), /permission denied/); }
  await as(king);
  const overview = (await db.query('select public.admin_giveaway_overview() as o')).rows[0].o;
  assert.equal(overview.current.id, giveaway);
  assert.deepEqual(overview.candidates, []);
  assert.equal(overview.history.length, 1);
});

test('with no giveaway running the card is empty and the King\'s Collection items are offered as candidates', async () => {
  const {db, as, king, prize} = await world();
  await as(null, 'anon');
  assert.equal((await db.query('select public.current_giveaway() as g')).rows[0].g, null);
  await as(king);
  const o = (await db.query('select public.admin_giveaway_overview() as o')).rows[0].o;
  assert.equal(o.current, null);
  assert.deepEqual(o.candidates.map(c => c.id), [prize]);
});

test('the schedule migration runs the maintenance sweep every 30 minutes', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610140143_giveaway_schedule.sql', import.meta.url), 'utf8');
  assert.match(sql, /cron\.schedule\('giveaway-maintenance', '\*\/30 \* \* \* \*'/);
  assert.match(sql, /public\.run_giveaway_maintenance\(\)/);
});

test('there is no early end: a giveaway is only drawn on its fixed end date, however many tickets it has', async () => {
  const {raw, db, as, giveaway} = await world({started: true});
  for (let i = 0; i < 4; i++) { const m = await member(raw, {email: 'm' + i + '@example.test', ready: true}); await enter(db, as, m); for (let j = 0; j < 3; j++) await listing(raw, m, {ageDays: 9 + j}); }
  assert.equal((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r.drawn, 0);
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  assert.equal((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r.drawn, 1);
});

test('a prize worth $5,000 or more cannot be a giveaway (that needs state registration and a bond), and is not offered as a candidate', async () => {
  const {db, as, raw, king} = await world();
  const insert = (title, cents) => raw("insert into public.listings(seller_id,title,description,category,price_cents,status) values($1,$2,'A fictional listing for testing only.','Sports',$3,'active') returning id", [king, title, cents]);
  const pricey = (await insert('Expensive jersey', 500000)).rows[0].id;
  const fine = (await insert('Cheaper jersey', 499900)).rows[0].id;
  await as(king);
  await assert.rejects(db.query('select public.admin_start_giveaway($1)', [pricey]), /\$5,000 or more/);
  const o = (await db.query('select public.admin_giveaway_overview() as o')).rows[0].o;
  assert.ok(!o.candidates.some(c => c.id === pricey) && o.candidates.some(c => c.id === fine));
  await assert.rejects(db.query("select public.admin_start_giveaway($1, now() + interval '2 hours')", [fine]), /at least a day/);
  await db.query('select public.admin_start_giveaway($1)', [fine]);
});

test('entrants and prize addresses must be in the 50 states or DC, and not in an excluded state (NY, FL, RI)', async () => {
  const {db, as, raw, giveaway} = await world({started: true});
  const m = await member(raw, {email: 'm@example.test', ready: true});
  await as(m);
  await assert.rejects(db.query('select public.enter_giveaway()'), /Choose the state/);
  await assert.rejects(db.query("select public.enter_giveaway('  ')"), /Choose the state/);
  for (const bad of ['NY', 'fl', 'RI', 'PR', 'ZZ', 'Texas']) { await as(m); await assert.rejects(db.query('select public.enter_giveaway($1)', [bad]), /not open to residents/); }
  assert.equal((await raw('select count(*)::int as c from public.giveaway_entries')).rows[0].c, 0);
  await enter(db, as, m, 'tx');
  assert.equal((await raw('select state from public.giveaway_entries')).rows[0].state, 'TX');
  for (const ok of ['DC', 'CA', 'AK']) { const other = await member(raw, {email: ok + '@example.test', ready: true}); await enter(db, as, other, ok); }
  // a winner cannot have the prize delivered to an excluded state
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  const winner = (await raw('select user_id from public.giveaway_winners where place=1')).rows[0].user_id;
  await as(winner);
  await assert.rejects(db.query('select public.claim_giveaway_prize($1)', [{...ADDRESS, state: 'NY'}]), /eligible state/);
  await db.query('select public.claim_giveaway_prize($1)', [{...ADDRESS, state: 'tx'}]);
  assert.equal((await raw("select shipping_address->>'state' as s from public.giveaway_winners where place=1")).rows[0].s, 'TX');
});

test('free email entries: operator-only, one ticket each, counted on the card, never twice for one email, state rules apply', async () => {
  const {db, as, raw, king, giveaway} = await world({started: true});
  const m = await member(raw, {email: 'm@example.test'});
  await as(m);
  await assert.rejects(db.query("select public.admin_add_mailin_entry('Pat','pat@example.test','TX')"), /Only an operator/);
  await as(king);
  await db.query("select public.admin_add_mailin_entry('  Pat Mailer ',' pat@example.test ','tx')");
  await assert.rejects(db.query("select public.admin_add_mailin_entry('Pat again','PAT@example.test','TX')"), /already has an entry/);
  await assert.rejects(db.query("select public.admin_add_mailin_entry('Nia','nia@example.test','NY')"), /not open to residents/);
  await assert.rejects(db.query("select public.admin_add_mailin_entry('Nia','not-an-email','TX')"), /violates check constraint/);
  const row = (await raw('select name, email, state from public.giveaway_mailin_entries')).rows[0];
  assert.deepEqual(row, {name: 'Pat Mailer', email: 'pat@example.test', state: 'TX'});
  await as(null, 'anon');
  const card = (await db.query('select public.current_giveaway() as g')).rows[0].g;
  assert.equal(card.mailin_entrants, 1); assert.equal(card.tickets, 1); assert.equal(card.entrants, 1);
  await as(king); await db.query('select public.admin_cancel_giveaway($1)', [giveaway]);
  await assert.rejects(db.query("select public.admin_add_mailin_entry('Late','late@example.test','TX')"), /no giveaway open/);
});

test('a mail-in entry can win: the operator is told to write to them, records their address, and the draw never emails a member', async () => {
  const {db, as, raw, king, giveaway} = await world({started: true});
  const alt = await member(raw, {email: 'alt@example.test', name: 'Alt', ready: true});
  await enter(db, as, alt);
  await as(king); await db.query("select public.admin_add_mailin_entry('Pat Mailer','pat@example.test','TX')");
  await raw('delete from net._http_calls');
  await raw('update public.stripe_accounts set charges_enabled=false where user_id=$1', [alt]); // the member has no valid ticket at draw time, so the mail-in entry wins
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  const w = (await raw('select id, user_id, mailin_id, status from public.giveaway_winners where place=1')).rows[0];
  assert.ok(w.mailin_id && !w.user_id && w.status === 'notified');
  const alerts = (await raw("select body->'data'->'attributes'->'properties'->>'winner' as winner from net._http_calls where body->'data'->'attributes'->'metric'->'data'->'attributes'->>'name'='Admin Alert: Giveaway Drawn'")).rows.map(r => r.winner).join(' | ');
  assert.match(alerts, /Pat Mailer \(mail-in entry, write to pat@example\.test/);
  assert.ok(!(await events(raw)).includes('Giveaway Won'));
  await as(king);
  await assert.rejects(db.query('select public.admin_record_mailin_claim($1,$2)', [w.id, {...ADDRESS, state: 'FL'}]), /eligible state/);
  const overview = (await db.query('select public.admin_giveaway_overview() as o')).rows[0].o;
  assert.equal(overview.history[0].winners[0].kind, 'mail-in'); assert.equal(overview.history[0].winners[0].email, 'pat@example.test');
  await db.query('select public.admin_record_mailin_claim($1,$2)', [w.id, ADDRESS]);
  assert.equal((await raw('select status from public.giveaway_winners where id=$1', [w.id])).rows[0].status, 'claimed');
  assert.equal((await raw("select shipping_address->>'city' as c from public.giveaway_winners where id=$1", [w.id])).rows[0].c, 'Austin');
});

test('a winner who never answers (member or mail-in) loses the prize to the alternate', async () => {
  const {db, as, raw, king, giveaway} = await world({started: true});
  const member1 = await member(raw, {email: 'm1@example.test', ready: true});
  await enter(db, as, member1);
  await as(king); await db.query("select public.admin_add_mailin_entry('Pat Mailer','pat@example.test','TX')");
  await raw("update public.giveaways set ends_at=now()-interval '1 minute' where id=$1", [giveaway]);
  await raw('select public.run_giveaway_maintenance()');
  const first = (await raw('select user_id, mailin_id from public.giveaway_winners where place=1')).rows[0];
  await raw("update public.giveaway_winners set claim_deadline=now()-interval '1 minute' where place=1");
  assert.equal((await raw('select public.run_giveaway_maintenance() as r')).rows[0].r.passed_to_alternate, 1);
  const second = (await raw('select user_id, mailin_id, status from public.giveaway_winners where place=2')).rows[0];
  assert.equal(second.status, 'notified');
  assert.notDeepEqual([first.user_id, first.mailin_id], [second.user_id, second.mailin_id]);
});
