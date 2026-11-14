import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sitemapUrls, buildSitemapFiles} from '../middleware.js';
import {createHandler, robotsBlocks, sitemapCounts, siteProblems, googleProblems, nextState, GRACE_DAYS} from '../supabase/functions/kingdom-search-check/handler.js';

const SITE = 'https://credabilia.com';
const page = url => `<!doctype html><html><head><link rel="canonical" href="${url}"></head><body>ok</body></html>`;

test('sitemap lists the Kingdom archive and each published story once, with real dates', () => {
  const urls = sitemapUrls({listings: [], storefronts: [], kingdom_articles: [
    {slug: 'darth-vader-saber', published_on: '2026-11-14', updated_at: '2026-11-14T18:15:49Z'},
    {slug: 'john-lennon-guitar', published_on: '2026-11-14', updated_at: '2026-11-14T09:14:13Z'},
    {slug: 'darth-vader-saber', published_on: '2026-11-14', updated_at: '2026-11-14T18:15:49Z'},
    {slug: '../bad', published_on: '2026-11-14'},
  ]});
  const kingdom = urls.filter(u => u.loc.includes('/kingdom'));
  assert.deepEqual(kingdom, [
    {loc: SITE + '/kingdom', lastmod: '2026-11-14'},
    {loc: SITE + '/kingdom/darth-vader-saber', lastmod: '2026-11-14'},
    {loc: SITE + '/kingdom/john-lennon-guitar', lastmod: '2026-11-14'},
  ]);
  assert.equal(new Set(urls.map(u => u.loc)).size, urls.length, 'no address twice');
  assert.ok(urls.some(u => u.loc === SITE + '/podcast'), 'existing pages stay');
});

test('a newly published story appears in the next sitemap with no rebuild; a withdrawn one (absent from the public read) does not', () => {
  const before = buildSitemapFiles({kingdom_articles: [{slug: 'john-lennon-guitar', published_on: '2026-11-14'}]}).files.main;
  const after = buildSitemapFiles({kingdom_articles: [{slug: 'new-story', published_on: '2026-11-15', updated_at: '2026-11-15T16:31:00Z'}, {slug: 'john-lennon-guitar', published_on: '2026-11-14'}]}).files.main;
  assert.doesNotMatch(before, /new-story/);
  assert.match(after, /<loc>https:\/\/credabilia\.com\/kingdom\/new-story<\/loc>\n    <lastmod>2026-11-15<\/lastmod>/);
  assert.match(after, /<loc>https:\/\/credabilia\.com\/kingdom<\/loc>\n    <lastmod>2026-11-15<\/lastmod>/);
});

test('robots.txt rules follow Googlebot precedence', () => {
  const robots = 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /founding\n';
  assert.equal(robotsBlocks(robots, '/kingdom/x'), false);
  assert.equal(robotsBlocks(robots, '/api/kingdom'), true);
  assert.equal(robotsBlocks('User-agent: Googlebot\nDisallow: /kingdom\n\nUser-agent: *\nAllow: /\n', '/kingdom/x'), true);
});

test('site checks catch a broken page, a wrong canonical, noindex and sitemap gaps', () => {
  const url = SITE + '/kingdom/a', sitemap = sitemapCounts(`<loc>${url}</loc>`);
  assert.deepEqual(siteProblems({url, status: 200, html: page(url), robotsTxt: '', sitemap}), []);
  assert.match(siteProblems({url, status: 503, html: '', robotsTxt: '', sitemap})[0], /HTTP 503/);
  assert.match(siteProblems({url, status: 200, html: page(SITE + '/kingdom'), robotsTxt: '', sitemap})[0], /preferred address/);
  assert.match(siteProblems({url, status: 200, html: page(url).replace('</head>', '<meta name="robots" content="noindex"></head>'), robotsTxt: '', sitemap})[0], /not to index/);
  assert.match(siteProblems({url, status: 200, html: page(url), robotsTxt: '', sitemap: sitemapCounts('')})[0], /missing from the sitemap/);
});

test('Google problems wait out the grace period for "not indexed" but flag blocks at once', () => {
  const url = SITE + '/kingdom/a';
  const unknown = {indexStatusResult: {verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google'}};
  assert.deepEqual(googleProblems(url, unknown, 1), []);
  assert.match(googleProblems(url, unknown, GRACE_DAYS + 1)[0], /not indexed 8 days.*unknown to Google/);
  assert.match(googleProblems(url, {indexStatusResult: {verdict: 'FAIL', robotsTxtState: 'DISALLOWED'}}, 0)[0], /robots\.txt/);
  assert.match(googleProblems(url, {indexStatusResult: {verdict: 'PASS', googleCanonical: SITE + '/kingdom'}}, 0)[0], /picked/);
  assert.deepEqual(googleProblems(url, {indexStatusResult: {verdict: 'PASS', googleCanonical: url, pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED'}}, 30), []);
});

test('an alert goes out once a problem lasts, is not repeated daily, and resets when fixed', () => {
  const t0 = new Date('2026-11-20T09:45:00Z'), t1 = new Date('2026-11-21T09:45:00Z'), t2 = new Date('2026-11-22T09:45:00Z');
  const first = nextState(null, 'x', {now: t0, persistent: false});
  assert.equal(first.alert, false, 'Google-side problem must be seen twice');
  const second = nextState(first.row, 'x', {now: t1, persistent: false});
  assert.equal(second.alert, true);
  assert.equal(nextState(second.row, 'x', {now: t2, persistent: false}).alert, false, 'not emailed again the next day');
  assert.equal(nextState(null, 'broken', {now: t0, persistent: true}).alert, true, 'a re-checked site problem alerts at once');
  assert.equal(nextState(second.row, null, {now: t2}).row.problem, null);
});

// A tiny stand-in for the Supabase client: enough for the handler's reads and writes.
function fakeService(store) {
  const query = table => {
    const q = {table, filters: [], select() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; },
      then(resolve) { resolve({data: table === 'kingdom_articles' ? store.stories : table === 'kingdom_search_status' ? store.status : store.runs, error: null}); },
      upsert(rows) { store.status = rows; return Promise.resolve({error: null}); },
      insert(row) { store.runs.unshift(row); return Promise.resolve({error: null}); },
      delete() { return {in: () => Promise.resolve({error: null})}; }};
    return q;
  };
  return {from: query, rpc: async (name, args) => { store.rpc.push([name, args]); return {data: name === 'kingdom_authorize_dispatch' ? args.p_token === 'a'.repeat(64) : null}; }};
}

test('the daily check reads our pages and Google, saves results, and stays quiet while things are fine', async () => {
  const story = SITE + '/kingdom/darth', archive = SITE + '/kingdom';
  const store = {stories: [{slug: 'darth', published_on: '2026-11-14'}], status: [], runs: [], rpc: []};
  const asked = [];
  const fetchFn = async (url, init = {}) => {
    asked.push(String(url));
    if (url === SITE + '/robots.txt') return new Response('User-agent: *\nAllow: /\nDisallow: /api/\n');
    if (url === SITE + '/sitemap.xml') return new Response(`<urlset><url><loc>${archive}</loc></url><url><loc>${story}</loc></url></urlset>`);
    if (url === story || url === archive) return new Response(page(url), {headers: {'content-type': 'text/html'}});
    if (String(url).startsWith('https://oauth2')) return Response.json({access_token: 't'});
    if (String(url).includes('/sitemaps/')) return Response.json({lastSubmitted: '2026-11-14T00:00:00Z', lastDownloaded: '2026-11-14T01:00:00Z', isPending: false, errors: '0', warnings: '0'});
    if (String(url).includes('urlInspection')) { const {inspectionUrl} = JSON.parse(init.body); return Response.json({inspectionResult: {indexStatusResult: {verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google', robotsTxtState: 'ALLOWED'}, inspectionResultLink: 'https://search.google.com/x?u=' + inspectionUrl}}); }
    throw new Error('unexpected ' + url);
  };
  const env = name => ({SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y', GOOGLE_SC_CLIENT_ID: 'c', GOOGLE_SC_CLIENT_SECRET: 's', GOOGLE_SC_REFRESH_TOKEN: 'r'}[name]);
  const handler = createHandler({createClient: () => fakeService(store), env, fetchFn, now: () => new Date('2026-11-15T09:45:00Z'), pause: async () => {}});
  assert.equal((await handler(new Request('https://f', {method: 'POST', headers: {Authorization: 'Bearer ' + 'b'.repeat(64)}}))).status, 403);
  const body = await (await handler(new Request('https://f', {method: 'POST', headers: {Authorization: 'Bearer ' + 'a'.repeat(64)}}))).json();
  assert.equal(body.status, 'ok');
  assert.equal(body.checked, 2);
  assert.equal(body.alerted, 0);
  assert.equal(store.status.find(r => r.url === story).google.coverage, 'URL is unknown to Google');
  assert.equal(store.rpc.filter(([n]) => n === 'notify_operator_alert').length, 0);
  assert.ok(!asked.some(u => u.includes('indexing.googleapis.com')), 'never uses the Indexing API');
});
