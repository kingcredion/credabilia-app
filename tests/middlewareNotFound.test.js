import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware} = await import('../middleware.js');

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /></head><body></body></html>';

// rpc: { name: () => ({ ok, body }) }; anything else asks for the page shell
function withFetch(rpc) {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const rpcName = String(url).match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpcName) { const {ok = true, body = null} = rpc[rpcName]?.() || {}; return {ok, json: async () => body}; }
    return {ok: true, text: async () => SHELL};
  };
  return () => { globalThis.fetch = original; };
}
const request = (path, ua) => new Request('https://credabilia.com' + path, {headers: {'user-agent': ua}});

test('a crawler asking for a storefront or item that does not exist is told 404 and noindex', async () => {
  const restore = withFetch({});
  try {
    for (const path of ['/triviachallenge', '/AuditorRewards', '/item/00000000-0000-0000-0000-000000000000']) {
      const response = await middleware(request(path, GOOGLEBOT));
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex', path);
      assert.match(await response.text(), /Credabilia/, 'still returns the app page body');
    }
  } finally { restore(); }
});

test('a real storefront and a real item still get their normal 200 page with their own title', async () => {
  const restore = withFetch({
    get_storefront: () => ({body: {display_name: 'King Credion', sales_count: 0, listings: []}}),
    get_listing_preview: () => ({body: {title: 'Signed Ball', price_cents: 5000, category: 'Sports', description: 'A ball.'}}),
  });
  try {
    const store = await middleware(request('/kingcredion', GOOGLEBOT));
    assert.equal(store.status, 200); assert.match(await store.text(), /King Credion \| Credabilia Storefront/);
    const item = await middleware(request('/item/11111111-1111-4111-8111-111111111111', GOOGLEBOT));
    assert.equal(item.status, 200); assert.match(await item.text(), /Signed Ball \| Credabilia/);
  } finally { restore(); }
});

test('if the database lookup itself fails, a crawler is never told the page is missing', async () => {
  const restore = withFetch({get_storefront: () => ({ok: false}), get_listing_preview: () => ({ok: false})});
  try {
    for (const path of ['/kingcredion', '/item/11111111-1111-4111-8111-111111111111']) {
      const response = await middleware(request(path, GOOGLEBOT));
      assert.notEqual(response?.status, 404, path + ' must fall through to the normal page');
    }
  } finally { restore(); }
});

test('people (not crawlers) and the built-in pages are never given a 404', async () => {
  const restore = withFetch({});
  try {
    const person = await middleware(request('/triviachallenge', BROWSER));
    assert.notEqual(person?.status, 404, 'a visitor still gets the app');
    for (const path of ['/terms', '/privacy', '/help', '/sell']) assert.notEqual((await middleware(request(path, GOOGLEBOT)))?.status, 404, path);
  } finally { restore(); }
});
