import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const mw = await import('../middleware.js');
const {default: middleware, isCrawler, clearSeoCache} = mw;

const CRAWLERS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0)',
  'Mozilla/5.0 (compatible; GoogleOther)',
  'Mozilla/5.0 (compatible; Google-Extended)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 Chrome-Lighthouse',
  'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 Lighthouse',
  'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
  'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'AdsBot-Google (+http://www.google.com/adsbot.html)',
  'Mozilla/5.0 (compatible; GPTBot/1.1)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
];

const PEOPLE = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  '',
];

test('every crawler and fetcher we know of is recognised, including Search Console\'s live URL test, and no real browser is', () => {
  for (const ua of CRAWLERS) assert.equal(isCrawler(ua), true, 'crawler: ' + ua);
  for (const ua of PEOPLE) assert.equal(isCrawler(ua), false, 'person: ' + ua);
  assert.equal(isCrawler(null), false);
  assert.equal(isCrawler(undefined), false);
});

test('Search Console\'s live test receives the page\'s own canonical, not the homepage one, and a browser still gets the plain app shell', async () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /><meta property="og:type" content="website" /><meta property="og:title" content="t" /><meta property="og:description" content="d" /><meta property="og:url" content="u" /><meta property="og:image" content="i" /></head><body><div id="root"></div></body></html>';
  const ITEM = {title: 'Signed Mike Tyson Boxing Glove', price_cents: 12500, category: 'Sports', description: 'A glove signed by the boxer, in a display case.', photo_path: 'x/y.jpg', attributes: {subject: 'Mike Tyson'}, certificate_issuer: 'psa', certificate_has_number: true, seller_slug: 'northfield', seller_name: 'Northfield Collection', giveaway_prize: false, listing_type: 'fixed'};
  clearSeoCache();
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const rpc = String(url).match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpc) return {ok: true, json: async () => rpc === 'get_listing_preview' ? ITEM : (rpc === 'seo_listing_index' ? [] : null)};
    return {ok: true, text: async () => SHELL};
  };
  try {
    const inspection = await middleware(new Request('https://credabilia.com/item/' + ID, {headers: {'user-agent': 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)'}}));
    const html = await inspection.text();
    assert.match(html, new RegExp('rel="canonical" href="https://credabilia.com/item/' + ID + '"'));
    assert.doesNotMatch(html, /rel="canonical" href="https:\/\/credabilia\.com\/"/);
    assert.match(html, /<title>Signed Mike Tyson Boxing Glove/);
    const person = await middleware(new Request('https://credabilia.com/item/' + ID, {headers: {'user-agent': PEOPLE[0]}}));
    assert.ok(!person || typeof person.text !== 'function' || !(await person.text()).includes('Signed Mike Tyson'), 'a person is passed straight through to the app, with no crawler copy');
  } finally { globalThis.fetch = original; }
});
