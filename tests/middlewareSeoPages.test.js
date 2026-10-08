import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware, shorten, productJsonLd} = await import('../middleware.js');

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /></head><body><div id="root"></div></body></html>';

function withFetch(rpc) {
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

const ITEM = {title: 'Signed Ball <b>', price_cents: 12500, category: 'Sports', description: 'A ball signed by a player.\nSecond line.', photo_path: 'x/y.jpg'};
const ITEM_ID = '11111111-1111-4111-8111-111111111111';

test('an item page for a crawler carries its own text, a self canonical and Product data', async () => {
  const f = withFetch({get_listing_preview: () => ({body: ITEM})});
  try {
    const html = await (await middleware(request('/item/' + ITEM_ID, GOOGLEBOT))).text();
    assert.match(html, /<div id="root"><main><h1>Signed Ball &lt;b&gt;<\/h1>/);
    assert.match(html, /\$125\.00 · Sports/);
    assert.match(html, new RegExp('rel="canonical" href="https://credabilia.com/item/' + ITEM_ID + '"'));
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(json['@type'], 'Product');
    assert.equal(json.offers.price, '125.00');
    assert.equal(json.offers.priceCurrency, 'USD');
    assert.equal(json.offers.availability, 'https://schema.org/InStock');
    assert.equal(json.sku, ITEM_ID);
    assert.match(html, /name="robots" content="index, follow/);
  } finally { f.restore(); }
});

test('a hostile title cannot break out of the Product data script tag', async () => {
  const f = withFetch({get_listing_preview: () => ({body: {...ITEM, title: '</script><script>alert(1)</script>'}})});
  try {
    const html = await (await middleware(request('/item/' + ITEM_ID, GOOGLEBOT))).text();
    assert.doesNotMatch(html, /<script>alert\(1\)/);
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(json.name, '</script><script>alert(1)</script>', 'the title itself is kept as written');
  } finally { f.restore(); }
});

test('help, terms, privacy, certificate and sell each get their own title and canonical, never the home page', async () => {
  const f = withFetch({});
  try {
    for (const [path, title] of [['/help', 'Help Center'], ['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy'], ['/certificate', 'Certificate lookup'], ['/sell', 'Sell your memorabilia']]) {
      const response = await middleware(request(path, GOOGLEBOT));
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, new RegExp('<title>' + title + ' \\| Credabilia</title>'), path);
      assert.match(html, new RegExp('rel="canonical" href="https://credabilia.com' + path + '"'), path);
      assert.match(html, /<div id="root"><main><h1>/, path);
    }
  } finally { f.restore(); }
});

test('the home page gives a crawler real links to the featured items, storefronts and key pages', async () => {
  const f = withFetch({
    merchant_feed_listings: () => ({body: [{id: ITEM_ID, title: 'Signed Ball', price_cents: 5000}]}),
    sitemap_entries: () => ({body: {listings: [], storefronts: ['kingcredion']}}),
  });
  try {
    const response = await middleware(request('/', GOOGLEBOT));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp('<a href="/item/' + ITEM_ID + '">Signed Ball</a> · \\$50\\.00'));
    assert.match(html, /<a href="\/kingcredion">kingcredion<\/a>/);
    assert.match(html, /<a href="\/certificate">Certificate lookup<\/a>/);
    assert.ok(f.requested.every(url => !/^https:\/\/credabilia\.com\/$/.test(url)), 'the page shell is fetched from /index.html so this middleware is not re-entered');
  } finally { f.restore(); }
});

test('people get the plain app on every address, home included', async () => {
  const f = withFetch({});
  try {
    for (const path of ['/', '/help', '/certificate']) {
      const response = await middleware(request(path, BROWSER));
      assert.ok(!response || response.status !== 404, path);
      if (response && response.status === 200) assert.doesNotMatch(await response.text(), /<main>/, path);
    }
  } finally { f.restore(); }
});

test('the sitemap lists the certificate lookup and sell pages', async () => {
  const f = withFetch({sitemap_entries: () => ({body: {listings: [], storefronts: []}})});
  try {
    const xml = await (await middleware(request('/sitemap.xml', BROWSER))).text();
    assert.match(xml, /<loc>https:\/\/credabilia.com\/certificate<\/loc>/);
    assert.match(xml, /<loc>https:\/\/credabilia.com\/sell<\/loc>/);
  } finally { f.restore(); }
});

test('descriptions are cut at a word, never mid-word', () => {
  const text = 'A handwritten signature is visible on the front of the framed display and the cartridge is included';
  const out = shorten(text, 60);
  assert.ok(out.endsWith('…'));
  const kept = out.slice(0, -1);
  assert.ok(text.startsWith(kept));
  assert.equal(text[kept.length], ' ', 'the cut falls on a space');
  assert.equal(shorten('short', 60), 'short');
});
