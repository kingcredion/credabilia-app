import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware} = await import('../middleware.js');

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /></head><body><div id="root"></div></body></html>';

function withFetch(rpc = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const rpcName = String(url).match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpcName) { const {ok = true, body = null} = rpc[rpcName]?.() || {}; return {ok, json: async () => body}; }
    return {ok: true, text: async () => SHELL};
  };
  return {restore: () => { globalThis.fetch = original; }};
}
const request = (path, ua) => new Request('https://credabilia.com' + path, {headers: {'user-agent': ua}});

// A Google crawler check found /giveaway-rules answering 404 + noindex: the page was treated as a store name that does not exist.
test('the giveaway rules page is a real page for a crawler, with its own title and canonical', async () => {
  const f = withFetch({get_storefront: () => ({body: null})});
  try {
    const response = await middleware(request('/giveaway-rules', GOOGLEBOT));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>Giveaway Official Rules \| Credabilia<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/credabilia.com\/giveaway-rules"/);
    assert.match(html, /<h1>Credabilia Giveaway Official Rules<\/h1>/);
    assert.match(html, /No purchase necessary/);
    assert.match(html, /<a href="\/giveaway-rules">Giveaway rules<\/a>/, 'linked from every page nav');
  } finally { f.restore(); }
});

test('the sitemap lists the giveaway rules', async () => {
  const f = withFetch({sitemap_entries: () => ({body: {listings: [], storefronts: []}})});
  try {
    const xml = await (await middleware(request('/sitemap.xml', 'Mozilla/5.0 Chrome/120'))).text();
    assert.match(xml, /<loc>https:\/\/credabilia.com\/giveaway-rules<\/loc>/);
  } finally { f.restore(); }
});

test('no member can claim giveaway-rules as a store name', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610140145_reserve_giveaway_rules_slug.sql', import.meta.url), 'utf8');
  assert.match(sql, /create or replace function public\.update_store_slug/);
  assert.match(sql, /'certificate','giveaway-rules'\]/);
});
