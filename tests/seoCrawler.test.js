import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const mw = await import('../middleware.js');
const {default: middleware, canonicalUrl, listingSeo, productJsonLd, breadcrumbJsonLd, sitemapUrls, buildSitemapFiles, categoryFromSlug, injectMeta, clearSeoCache} = mw;

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /><meta property="og:type" content="website" /><meta property="og:title" content="t" /><meta property="og:description" content="d" /><meta property="og:url" content="u" /><meta property="og:image" content="i" /></head><body><div id="root"></div></body></html>';

function withFetch(rpc) {
  clearSeoCache();
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async url => {
    const rpcName = String(url).match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpcName) { calls.push(rpcName); const r = rpc[rpcName]?.() || {}; return {ok: r.ok ?? true, json: async () => r.body ?? null}; }
    return {ok: true, text: async () => SHELL};
  };
  return {calls, restore: () => { globalThis.fetch = original; }};
}
const request = (path, ua = GOOGLEBOT) => new Request('https://credabilia.com' + path, {headers: {'user-agent': ua}});

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ITEM = {title: 'Signed Mike Tyson Boxing Glove', price_cents: 12500, category: 'Sports', description: 'A glove signed by the boxer, in a display case.', photo_path: 'x/y.jpg', attributes: {subject: 'Mike Tyson', sport: 'Boxing', year: '1988'}, certificate_issuer: 'psa', certificate_has_number: true, seller_slug: 'northfield', seller_name: 'Northfield Collection', giveaway_prize: false, listing_type: 'fixed'};

test('the canonical address ignores tracking and share parameters and a trailing slash', async () => {
  assert.equal(canonicalUrl('https://credabilia.com/item/abc?utm_source=ig&ref=k1&fbclid=z#top'), 'https://credabilia.com/item/abc');
  assert.equal(canonicalUrl('https://credabilia.com/kingcredion/'), 'https://credabilia.com/kingcredion');
  assert.equal(canonicalUrl('https://credabilia.com/?list=1&giveaway=1'), 'https://credabilia.com/');
  const f = withFetch({get_listing_preview: () => ({body: ITEM}), seo_listing_index: () => ({body: []})});
  try {
    const html = await (await middleware(request('/item/' + ID + '?utm_source=ig&ref=abc&gclid=1'))).text();
    assert.match(html, new RegExp('rel="canonical" href="https://credabilia.com/item/' + ID + '"'));
    assert.match(html, new RegExp('og:url" content="https://credabilia.com/item/' + ID + '"'));
    assert.doesNotMatch(html, /utm_source|gclid/);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, 'exactly one canonical tag');
  } finally { f.restore(); }
});

test('an item page carries its own social tags, product type, breadcrumb, seller and category links, details and a certificate line only when there is one', async () => {
  const f = withFetch({get_listing_preview: () => ({body: ITEM}), seo_listing_index: () => ({body: [{id: OTHER, title: 'Signed Canseco baseball card', price_cents: 4000, category: 'Sports'}]})});
  try {
    const response = await middleware(request('/item/' + ID));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /og:type" content="product"/);
    for (const tag of ['twitter:title', 'twitter:description', 'twitter:image']) assert.match(html, new RegExp(tag));
    assert.match(html, /<nav aria-label="Breadcrumb"><a href="\/">Home<\/a> › <a href="\/category\/sports">Sports<\/a> › <span>Signed Mike Tyson Boxing Glove<\/span><\/nav>/);
    assert.match(html, /<a href="\/northfield">Northfield Collection<\/a>/);
    assert.match(html, /<li>Person, character or subject: Mike Tyson<\/li>/);
    assert.match(html, /Certificate issuer listed: PSA\/DNA/);
    assert.match(html, new RegExp('<a href="/item/' + OTHER + '">Signed Canseco baseball card</a>'), 'a related listing is linked');
    assert.match(html, /alt="Signed Mike Tyson Boxing Glove – Sports memorabilia"/);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    assert.deepEqual(ld.map(j => j['@type']), ['Product', 'BreadcrumbList']);
    assert.ok(ld[0].additionalProperty.some(p => p.name === 'Team' || p.name === 'Sport'), 'real details become product properties');
    assert.deepEqual(ld[1].itemListElement.map(e => e.name), ['Home', 'Sports', 'Signed Mike Tyson Boxing Glove']);
  } finally { f.restore(); }
  const g = withFetch({get_listing_preview: () => ({body: {...ITEM, certificate_issuer: null, certificate_has_number: false, attributes: {}, seller_slug: null}}), seo_listing_index: () => ({body: []})});
  try {
    const html = await (await middleware(request('/item/' + ID))).text();
    assert.doesNotMatch(html, /Certificate issuer listed/, 'no certificate on the listing means none is mentioned');
    assert.doesNotMatch(html, /Listed by/, 'no store name means no seller link');
    assert.doesNotMatch(html, /authenticated/i, 'authentication is never claimed');
  } finally { g.restore(); }
});

test('SEO text is derived from real fields, never invents anything, and keeps descriptions short', () => {
  const seo = listingSeo(ITEM);
  assert.equal(seo.title, 'Signed Mike Tyson Boxing Glove | Credabilia');
  assert.match(seo.description, /^Explore Signed Mike Tyson Boxing Glove on Credabilia\. Price \$125\.00\. Boxing · 1988\. PSA\/DNA certificate number listed\./);
  assert.ok(seo.description.length <= 156);
  assert.equal(listingSeo({title: 'Framed jersey', price_cents: 5000, category: 'Sports', description: 'x'.repeat(300)}).description.endsWith('…'), true);
  const noCert = listingSeo({...ITEM, certificate_issuer: null, certificate_has_number: false});
  assert.doesNotMatch(noCert.description, /certificate/i);
  const plain = listingSeo({title: 'Old comic', price_cents: 900, category: 'Comics', description: 'A comic book in fair shape for its age.'});
  assert.doesNotMatch(plain.description, /undefined|null|Authentic/i);
  assert.equal(listingSeo({title: 'Glove', attributes: {subject: 'Mike Tyson'}, price_cents: 100}).title, 'Glove – Mike Tyson | Credabilia', 'the person is added to a title that leaves them out');
  assert.equal(listingSeo({title: 'Mike Tyson glove', attributes: {subject: 'Mike Tyson'}, price_cents: 100}).title, 'Mike Tyson glove | Credabilia', 'but not repeated when it is already there');
  assert.equal(listingSeo({title: 'Auction piece', price_cents: 2000, listing_type: 'auction', description: 'An item on auction right now.'}).description.includes('Current price $20.00.'), true);
});

test('the giveaway prize is described honestly: not for sale, no offer, no category link, a link to the rules', async () => {
  const prize = {...ITEM, title: 'Michael Vick #7 Football Jersey', giveaway_prize: true};
  assert.equal(productJsonLd({...prize, id: ID}, 'https://credabilia.com/item/' + ID, null).offers, undefined, 'a prize has no price or availability');
  assert.match(listingSeo(prize).description, /prize in the Credabilia giveaway\. Not for sale\./);
  const f = withFetch({get_listing_preview: () => ({body: prize}), seo_listing_index: () => ({body: [{id: OTHER, title: 'Should not appear', price_cents: 1}]})});
  try {
    const html = await (await middleware(request('/item/' + ID))).text();
    assert.match(html, /Giveaway prize\. Not for sale\./);
    assert.match(html, /<a href="\/giveaway-rules">Official giveaway rules<\/a>/);
    assert.doesNotMatch(html, /"offers"|InStock|Should not appear/);
    assert.doesNotMatch(html, /breadcrumb"[^>]*>.*category\/sports.*<h1>/, 'the prize is not filed under a category');
    assert.deepEqual(f.calls, ['get_listing_preview'], 'no related-items lookup for a prize');
  } finally { f.restore(); }
});

test('a category page has its own title, description, heading, intro, links, breadcrumb and structured data', async () => {
  const f = withFetch({
    sitemap_entries: () => ({body: {categories: [{category: 'Sports', count: 2, lastmod: '2026-10-14T10:00:00Z'}], listings: [], storefronts: []}}),
    seo_listing_index: () => ({body: [{id: ID, title: 'Signed Mike Tyson Boxing Glove', price_cents: 12500}, {id: OTHER, title: 'Signed Canseco card', price_cents: 4000}]}),
  });
  try {
    const response = await middleware(request('/category/sports'));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>Sports Memorabilia and Collectibles \| Credabilia<\/title>/);
    assert.match(html, /content="Browse 2 sports memorabilia and collectible listings on Credabilia, with photos, prices and seller storefronts\."/);
    assert.match(html, /rel="canonical" href="https:\/\/credabilia.com\/category\/sports"/);
    assert.match(html, /<h1>Sports memorabilia and collectibles<\/h1>/);
    assert.match(html, /name="robots" content="index, follow/);
    assert.match(html, new RegExp('<a href="/item/' + ID + '">Signed Mike Tyson Boxing Glove</a> · \\$125.00'));
    assert.match(html, /<a href="\/category\/comics">Comics<\/a>/, 'the other categories are linked');
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    assert.deepEqual(ld.map(j => j['@type']), ['BreadcrumbList', 'CollectionPage']);
    assert.equal(ld[1].mainEntity['@type'], 'ItemList');
    assert.equal(ld[1].mainEntity.itemListElement.length, 2);
  } finally { f.restore(); }
});

test('a category with nothing public is not indexed, an unknown category is a 404, and people are never blocked', async () => {
  const empty = withFetch({sitemap_entries: () => ({body: {categories: [{category: 'Sports', count: 3}], listings: [], storefronts: []}}), seo_listing_index: () => ({body: []})});
  try {
    const html = await (await middleware(request('/category/art'))).text();
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.match(html, /There are no art listings right now/);
    const gone = await middleware(request('/category/not-a-category'));
    assert.equal(gone.status, 404);
    assert.equal(gone.headers.get('x-robots-tag'), 'noindex');
    const person = await middleware(request('/category/sports', BROWSER));
    assert.ok(!person || person.status !== 404, 'people get the app');
  } finally { empty.restore(); }
  assert.equal(categoryFromSlug('SPORTS'), 'Sports');
  assert.equal(categoryFromSlug('nope'), null);
});

test('the sitemap lists categories with real inventory, writes dates only where the database has them, and never lists empty categories', async () => {
  const data = {
    listings: [{id: ID, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-14T18:30:00Z'}, {id: OTHER, created_at: '2026-10-05T10:00:00Z'}],
    storefronts: ['northfield'], storefront_entries: [{slug: 'northfield', lastmod: '2026-10-14T18:30:00Z'}],
    categories: [{category: 'Sports', count: 2, lastmod: '2026-10-14T18:30:00Z'}, {category: 'Art', count: 0}],
  };
  const urls = sitemapUrls(data);
  const by = loc => urls.find(u => u.loc === 'https://credabilia.com' + loc);
  assert.equal(by('/item/' + ID).lastmod, '2026-10-14', 'the real modification date is used');
  assert.equal(by('/item/' + OTHER).lastmod, '2026-10-05', 'with no modification date the created date is the honest fallback');
  assert.ok(!by('/').lastmod, 'home has no real date, so none is written');
  assert.equal(by('/category/sports').lastmod, '2026-10-14');
  assert.equal(by('/category/art'), undefined, 'an empty category is not listed');
  assert.equal(by('/northfield').lastmod, '2026-10-14');
  const xml = buildSitemapFiles(data).files.main;
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.equal((xml.match(/<loc>/g) || []).length, urls.length);
  assert.doesNotMatch(xml, /<lastmod><\/lastmod>/);
});

test('a large site gets a sitemap index and numbered files, each within the limit; a small one stays a single file', () => {
  const listings = Array.from({length: 25}, (_, i) => ({id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), created_at: '2026-10-01T00:00:00Z'}));
  const small = buildSitemapFiles({listings, storefronts: [], categories: []});
  assert.equal(small.index, null);
  const big = buildSitemapFiles({listings, storefronts: [], categories: []}, 'https://credabilia.com', 10);
  assert.match(big.index, /<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const names = Object.keys(big.files);
  assert.deepEqual(names, ['pages-1.xml', 'pages-2.xml', 'pages-3.xml', 'pages-4.xml'], '7 information pages + 25 listings = 32 URLs, ten to a file');
  for (const name of names) { assert.ok((big.files[name].match(/<loc>/g) || []).length <= 10); assert.match(big.index, new RegExp('https://credabilia.com/sitemaps/' + name.replace('.', '\\.'))); }
  assert.equal(names.reduce((total, name) => total + (big.files[name].match(/<loc>/g) || []).length, 0), sitemapUrls({listings, storefronts: [], categories: []}).length, 'every URL lands in exactly one file');
});

test('/sitemap.xml is valid XML for everyone, a failed lookup is a retryable 503 (never a partial sitemap), and repeated crawler visits cost one lookup', async () => {
  const f = withFetch({sitemap_entries: () => ({body: {listings: [{id: ID, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-14T00:00:00Z'}], storefronts: [], categories: []}})});
  try {
    const first = await middleware(request('/sitemap.xml', BROWSER));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.match(await first.text(), /<lastmod>2026-10-14<\/lastmod>/);
    await middleware(request('/sitemap.xml', GOOGLEBOT)); await middleware(request('/sitemap.xml', GOOGLEBOT));
    assert.equal(f.calls.filter(c => c === 'sitemap_entries').length, 1, 'cached for a minute');
  } finally { f.restore(); }
  const down = withFetch({sitemap_entries: () => ({ok: false})});
  try {
    const response = await middleware(request('/sitemap.xml', BROWSER));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '300');
  } finally { down.restore(); }
});

test('hostile text in a title, store name or category intro cannot break out of the page or the structured data', async () => {
  const evil = '</script><img src=x onerror=alert(1)>"\'';
  const f = withFetch({
    get_storefront: () => ({body: {display_name: evil, listings: [{id: ID, title: evil}], sales_count: 0}}),
    get_listing_preview: () => ({body: {...ITEM, title: evil, description: evil, attributes: {team: evil}, seller_name: evil}}),
    seo_listing_index: () => ({body: [{id: OTHER, title: evil, price_cents: 100}]}),
  });
  try {
    for (const path of ['/northfield', '/item/' + ID]) {
      const html = await (await middleware(request(path))).text();
      assert.ok(!html.includes('<img src=x'), path);
      assert.ok(!/<\/script><img/.test(html), path);
      for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) JSON.parse(m[1]);
    }
  } finally { f.restore(); }
});

test('injecting metadata keeps one canonical, one robots tag, and honours an explicit noindex', () => {
  const html = injectMeta(SHELL, {title: 'T', description: 'D', image: 'https://credabilia.com/i.png', robots: 'noindex, follow', ogType: 'product'}, 'https://credabilia.com/category/art');
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((html.match(/name="robots"/g) || []).length, 1);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.match(html, /og:type" content="product"/);
  assert.deepEqual(breadcrumbJsonLd([['Home', 'https://credabilia.com/'], ['Sports', null]]).itemListElement.map(e => e.position), [1, 2]);
});
