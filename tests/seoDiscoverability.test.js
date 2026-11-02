import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware, clearSeoCache} = await import('../middleware.js');
const {retiredStatus, RETIRED_PATHS} = await import('../src/retiredUrls.js');
const {canonicalFor} = await import('../src/pageHead.js');
const {listingSeo, STATIC_PAGES, categoryDescription} = await import('../src/seoText.js');

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const INSPECTION = 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /></head><body><div id="root"></div></body></html>';
const request = (path, ua) => new Request('https://credabilia.com' + path, {headers: {'user-agent': ua}});
function withFetch(rpc = {}) {
  clearSeoCache();
  const original = globalThis.fetch, requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    const name = String(url).match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (name) { const r = rpc[name]?.() || {}; return {ok: r.ok ?? true, json: async () => r.body ?? null}; }
    return {ok: true, text: async () => SHELL};
  };
  return {requested, restore: () => { globalThis.fetch = original; }};
}

test('a retired old-app address is a real 410 for people and crawlers alike, with no lookups, and live pages are untouched', async () => {
  const f = withFetch();
  try {
    for (const ua of [GOOGLEBOT, INSPECTION, BROWSER]) {
      for (const path of ['/AdminApprovals', '/adminapprovals/']) {
        const response = await middleware(request(path, ua));
        assert.equal(response.status, 410, ua + ' ' + path);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex');
        assert.match(await response.text(), /This page is gone/);
      }
    }
    assert.equal(f.requested.length, 0, 'no database or origin call for a retired page');
    assert.equal(retiredStatus('/sell'), 0);
    assert.equal(retiredStatus('/item/abc'), 0);
    assert.equal(retiredStatus('/'), 0);
    const live = await middleware(request('/sell', GOOGLEBOT));
    assert.equal(live.status, 200);
  } finally { f.restore(); }
  assert.ok(RETIRED_PATHS.has('adminapprovals'));
});

test('the Founding 100 invitation page is no longer a 404 for link previews, and it stays noindex, nofollow, outside the sitemap and disallowed in robots.txt', async () => {
  const f = withFetch({get_storefront: () => ({body: null}), sitemap_entries: () => ({body: {listings: [], storefronts: []}})});
  try {
    const response = await middleware(request('/founding', 'facebookexternalhit/1.1'));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>Founding 100 \| Credabilia<\/title>/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.equal(f.requested.some(url => /get_storefront/.test(url)), false, 'not looked up as a store name');
    const xml = await (await middleware(request('/sitemap.xml', BROWSER))).text();
    assert.doesNotMatch(xml, /founding/);
  } finally { f.restore(); }
  assert.match(await read('public/robots.txt'), /^Disallow: \/founding$/m);
  assert.match(squash(await read('src/Legal.jsx')), /meta\.name = 'robots'; meta\.content = 'noindex, nofollow'/);
});

test('people and crawlers are told the same thing about one address: the app updates the canonical and description a browser carries', async () => {
  assert.equal(canonicalFor('/item/abc/'), 'https://credabilia.com/item/abc');
  assert.equal(canonicalFor('/'), 'https://credabilia.com/');
  assert.equal(canonicalFor('/podcast'), 'https://credabilia.com/podcast');
  // The text is shared with the crawler layer, so the two cannot drift apart.
  const item = {id: 'a', title: 'Signed Ball', price_cents: 5000, category: 'Sports', description: 'A ball.', listing_type: 'fixed'};
  const f = withFetch({get_listing_preview: () => ({body: item})});
  try {
    const html = await (await middleware(request('/item/a', GOOGLEBOT))).text();
    assert.ok(html.includes('<title>' + listingSeo(item).title + '</title>'));
    assert.ok(html.includes('content="' + listingSeo(item).description + '"'));
  } finally { f.restore(); }
  assert.match(categoryDescription('Sports', 3), /^Browse 3 sports memorabilia/);
  assert.equal(STATIC_PAGES.sell.title, 'Sell your memorabilia | Credabilia');
  const app = squash(await read('src/App.jsx'));
  assert.match(app, /setPageHead\(\{ title: seo\.title, description: seo\.description, pathname: '\/item\/' \+ item\.id \}\)/);
  assert.match(app, /setPageHead\(\{ title: page\.title, description: page\.description \}\)/, 'help, terms, privacy and the other information pages');
  const legal = squash(await read('src/Legal.jsx'));
  assert.match(legal, /setPageHead\(\{ title: `\$\{PODCAST\.name\} \| Credabilia`, description: PODCAST\.seoDescription, pathname: '\/podcast' \}\)/);
  assert.match(legal, /pathname: episodePath\(episode\.slug\)/);
  assert.match(legal, /episode\.index === false \? markNoIndex\(\)/);
  assert.match(squash(await read('src/Storefront.jsx')), /store === null\) return markNoIndex\(\)/);
});

test('the client never adds structured data, so a crawler is never given a second copy of what middleware.js already sends', async () => {
  const head = await read('src/pageHead.js');
  assert.doesNotMatch(head, /createElement\('script'\)|application\/ld\+json'/);
});

test('item cards, category filters and the Kings Collection are real links, and a modified click is left to the browser', async () => {
  const app = squash(await read('src/App.jsx')), carousel = squash(await read('src/KingsCollectionCarousel.jsx'));
  assert.match(app, /\['All items', \.\.\.CATEGORIES\]\.map\(c => <a key=\{c\} href=\{pathForBrowse\(c\)\}/);
  assert.match(app, /const Card = collectionFilter === 'owned' \? 'button' : 'a'; return <Card \{\.\.\.\(Card === 'a' \? \{ href: `\/item\/\$\{item\.id\}` \} : \{\}\)\}/, 'the owned-items view keeps its order buttons');
  assert.match(app, /const isPlainClick = event => event\.button === 0 && !event\.metaKey && !event\.ctrlKey && !event\.shiftKey && !event\.altKey;/);
  assert.match(app, /event\.preventDefault\(\); event\.stopPropagation\(\); toggleFavorite\(item\.id\)/, 'the heart inside a link must not follow the link');
  assert.match(app, /event\.preventDefault\(\); event\.stopPropagation\(\); messageSeller\(item\.id\)/);
  assert.match(carousel, /<a href=\{'\/item\/' \+ item\.id\} className="royal-product"/);
  assert.doesNotMatch(carousel, /<button type="button" className="royal-product"/);
});

test('podcast pages: the page links every episode, the sitemap lists only episodes open to search, and the footer links to /podcast', async () => {
  const legal = squash(await read('src/Legal.jsx')), app = squash(await read('src/App.jsx'));
  assert.match(legal, /<a className="podcast-episode-title" href=\{episodePath\(e\.slug\)\}>/);
  assert.match(app, /<a href="\/podcast">Podcast<\/a>/);
  const f = withFetch({
    sitemap_entries: () => ({body: {listings: [], storefronts: [], categories: []}}),
    podcast_sitemap_entries: () => ({body: [{slug: 'davids-take-one', lastmod: '2026-10-27T00:00:00Z'}]}),
  });
  try {
    const xml = await (await middleware(request('/sitemap.xml', BROWSER))).text();
    assert.match(xml, /<loc>https:\/\/credabilia.com\/podcast<\/loc>/);
    assert.match(xml, /<loc>https:\/\/credabilia.com\/podcast\/davids-take-one<\/loc>/);
  } finally { f.restore(); }
});

test('"Back to Credabilia" never points at another information page, so Podcast and Certificates cannot send a visitor round in circles', async () => {
  const {isInfoPage} = await import('../src/Legal.jsx').catch(() => ({}));
  const legal = squash(await read('src/Legal.jsx'));
  assert.match(legal, /const LEGAL_PATHS = \['\/terms', '\/privacy', '\/help', '\/certificate', '\/podcast', '\/giveaway-rules', '\/founding'\];/);
  assert.match(legal, /path\.startsWith\('\/podcast\/'\)/, 'episodes count as information pages');
  assert.match(legal, /!isInfoPage\(referrer\.pathname\)/, 'a visit from one information page never replaces the remembered return page');
  assert.match(legal, /saved && !isInfoPage\(saved\.split\('\?'\)\[0\]\) \? saved : '\/'/, 'an old saved value that is itself an information page is ignored');
  void isInfoPage;
});
