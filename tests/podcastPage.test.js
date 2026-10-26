import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware} = await import('../middleware.js');
const {PODCAST, PODCAST_LISTEN_LINKS, podcastJsonLd} = await import('../src/podcast.js');

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /></head><body><div id="root"></div></body></html>';

function withFetch(rpc = {}) {
  const original = globalThis.fetch, requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    const rpcName = String(url).match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpcName) { const {ok = true, body = null} = rpc[rpcName]?.() || {}; return {ok, json: async () => body}; }
    return {ok: true, text: async () => SHELL};
  };
  return {requested, restore: () => { globalThis.fetch = original; }};
}
const request = (path, ua) => new Request('https://credabilia.com' + path, {headers: {'user-agent': ua}});

test('the show facts are the published ones, the AI disclosure is on the page, and nothing promises a schedule or fact-checking', () => {
  assert.equal(PODCAST.name, 'The Memorabilia Kingdom Podcast');
  assert.equal(PODCAST.spotifyShow, 'https://open.spotify.com/show/3OYqLNzUSeG6XOyyitwLWN');
  assert.equal(PODCAST.spotifyEmbed, 'https://open.spotify.com/embed/show/3OYqLNzUSeG6XOyyitwLWN');
  assert.equal(PODCAST.apple, 'https://podcasts.apple.com/us/podcast/the-memorabilia-kingdom-podcast/id6826494805');
  assert.deepEqual(PODCAST_LISTEN_LINKS.map(([label]) => label), ['Spotify', 'Apple Podcasts', 'iHeart']);
  for (const [, href] of PODCAST_LISTEN_LINKS) assert.match(href, /^https:\/\//);
  assert.match(PODCAST.aiNote, /^King Credion is an AI character\. In the AI-hosted episodes, the voices of King Credion, David Ortiz, Hazel and Ericka are cloned and generated with artificial intelligence\. In David’s Take, David appears as himself, in his real voice and on video\.$/);
  const words = [PODCAST.description, PODCAST.seoDescription, PODCAST.aiNote].join(' ');
  assert.doesNotMatch(words, /every night|every day|daily|weekly|fact-checked|guarantee|\bfree\b/i, 'no schedule, no fact-check claim, no promises');
});

test('structured data describes the show and where to hear it', () => {
  const json = podcastJsonLd();
  assert.equal(json['@type'], 'PodcastSeries');
  assert.equal(json.url, 'https://credabilia.com/podcast');
  assert.equal(json.webFeed, PODCAST.rss);
  assert.deepEqual(json.sameAs, [PODCAST.spotifyShow, PODCAST.apple, PODCAST.iheart]);
});

test('a crawler gets the podcast page with its own title, canonical, listen links, the AI note and show data, not a store lookup', async () => {
  const f = withFetch({get_storefront: () => ({body: null})});
  try {
    const response = await middleware(request('/podcast', GOOGLEBOT));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>The Memorabilia Kingdom Podcast \| Credabilia<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/credabilia.com\/podcast"/);
    assert.match(html, /<h1>The Memorabilia Kingdom Podcast<\/h1>/);
    assert.match(html, /<a href="https:\/\/open\.spotify\.com\/show\/3OYqLNzUSeG6XOyyitwLWN">Listen on Spotify<\/a>/);
    assert.match(html, /Listen on Apple Podcasts/);
    assert.match(html, /King Credion is an AI character/);
    assert.match(html, /"@type":"PodcastSeries"/);
    assert.match(html, /<a href="\/podcast">Podcast<\/a>/, 'linked from the page nav');
    assert.equal(f.requested.some(url => /get_storefront/.test(url)), false, 'it is a page, not a store name');
  } finally { f.restore(); }
});

test('the sitemap lists the podcast page', async () => {
  const f = withFetch({sitemap_entries: () => ({body: {listings: [], storefronts: []}})});
  try {
    const xml = await (await middleware(request('/sitemap.xml', 'Mozilla/5.0 Chrome/120'))).text();
    assert.match(xml, /<loc>https:\/\/credabilia.com\/podcast<\/loc>/);
  } finally { f.restore(); }
});

test('the page is routed, linked, and the Spotify player loads only when a visitor asks for it', async () => {
  const app = squash(await read('src/App.jsx')), legal = squash(await read('src/Legal.jsx'));
  assert.match(app, /window\.location\.pathname === '\/podcast' \? 'podcast'/);
  assert.match(app, /if \(legalPage === 'podcast'\) return <PodcastPage\/>;/);
  assert.match(app, /<a href="\/podcast">Podcast<\/a>/, 'in the site footer');
  assert.match(legal, /\['\/podcast', 'Podcast', 'podcast'\]/, 'in the legal-page navigation');
  const page = legal.split('export function PodcastPage()')[1].split('// The invitation claim page')[0];
  assert.match(page, /const \[player, setPlayer\] = useState\(false\)/);
  assert.match(page, /\{player\s*\n?\s*\? <iframe[^>]*src=\{PODCAST\.spotifyEmbed\}/, 'the iframe exists only after the visitor clicks');
  assert.match(page, /onClick=\{\(\) => setPlayer\(true\)\}/);
  assert.match(page, /PODCAST\.aiNote/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(legal, /Our podcast page \(credabilia\.com\/podcast\) offers an optional Spotify player/, 'the Privacy Policy says so');
  assert.match(legal, /<strong>Spotify<\/strong>/);
});

test('the home page hero has a podcast button next to the store buttons, on the website only, and no Spotify code loads there', async () => {
  const app = squash(await read('src/App.jsx'));
  assert.match(app, /workspace === 'collector' && !isNativeApp\(\) && <div className="store-links">/, 'website Discover only: the phone apps carry their own bundle and /podcast is a website page');
  const storeRow = app.split('<div className="store-links">')[1].split('</div>}')[0];
  assert.match(storeRow, /Google Play[\s\S]*Coming soon[\s\S]*<a className="store-link store-link-live store-link-podcast" href="\/podcast"><img src="\/brand\/podcast-microphone-96\.webp"[\s\S]*Listen to the[\s\S]*Podcast/, 'after the two app buttons');
  assert.doesNotMatch(storeRow, /spotify/i, 'the player stays on /podcast and loads only when a visitor asks');
  assert.doesNotMatch(app, /PodcastBar|podcast-bar/, 'the separate bar is gone: the hero button replaced it');
});

test('no member can claim "podcast" as a store name, and the reserved list is patched without losing the others', async () => {
  const sql = squash(await read('supabase/migrations/202610240164_reserve_podcast_slug.sql'));
  assert.match(sql, /'giveaway-rules'',''podcast'/);
  const middlewareSource = squash(await read('middleware.js'));
  assert.match(middlewareSource, /'giveaway-rules', 'category', 'podcast'\]\)/);

  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  const db = new PGlite({extensions: {vector}});
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
  for (const file of migrations) { const text = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'); if (/cron.(un)?schedule/.test(text)) continue; await db.exec(text); }
  const user = '99999999-0000-4000-8000-000000000001';
  await db.exec('reset role');
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [user, 'seller@example.test']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role authenticated');
  for (const reserved of ['podcast', 'giveaway-rules', 'founding', 'category', 'certificate', 'help']) {
    await assert.rejects(db.query('select public.update_store_slug($1)', [reserved]), /reserved/, reserved + ' stays reserved');
  }
  await db.query("select public.update_store_slug('podcast-fan-shop')");
});
