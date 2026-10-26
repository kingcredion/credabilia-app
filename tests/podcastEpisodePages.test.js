import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

process.env.VITE_SUPABASE_URL = 'https://db.example.test';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'anon';
const {default: middleware, config, sitemapUrls, buildSitemapFiles, clearSeoCache} = await import('../middleware.js');
const {episodePath, episodeJsonLd, VOICE_NOTES, KIND_LABELS, formatDuration, formatEpisodeDate, paragraphsOf, PODCAST} = await import('../src/podcast.js');

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SHELL = '<html><head><title>Credabilia | The Memorabilia Kingdom</title><meta name="description" content="x" /><link rel="canonical" href="https://credabilia.com/" /></head><body><div id="root"></div></body></html>';
const EPISODE = {
  slug: 'davids-take-why-a-mantle-sold-for-329-400', title: 'David\'s Take: Why a Mantle Sold for $329,400', summary: 'Heritage sold a 1960 Topps Mickey Mantle PSA 9 for $329,400.',
  body: 'Heritage sold a 1960 Topps Mickey Mantle PSA 9 for $329,400.\n\nThe record was about $64,100.', published_at: '2026-10-26T17:27:00Z', updated_at: '2026-10-26T18:00:00Z',
  audio_url: 'https://anchor.fm/s/1/podcast/play/1/a.mp3', image_url: 'https://cdn.example.com/art.jpg', spotify_url: 'https://podcasters.spotify.com/e1', duration_seconds: 339,
  kind: 'davids_take', sources: ['https://news.example.com/mantle'], transcript: null, index: true,
  related: [{slug: 'king-credions-court-ohtani', title: 'King Credion\'s Court: Ohtani', published_at: '2026-10-25T01:48:38Z', kind: 'ai_hosted'}],
};

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
const request = (path, ua = GOOGLEBOT) => new Request('https://credabilia.com' + path, {headers: {'user-agent': ua}});
const jsonLd = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1].replace(/\\u003c/g, '<')));

test('the episode route is handled by the search layer, and every address is the canonical one', () => {
  assert.ok(config.matcher.includes('/podcast/:slug'));
  assert.equal(episodePath('abc'), '/podcast/abc');
});

test('a crawler gets the episode as real HTML: title, canonical, summary, voice statement, source links, related episodes, listen links, and indexable', async () => {
  clearSeoCache();
  const f = withFetch({podcast_episode: () => ({body: EPISODE})});
  try {
    const response = await middleware(request('/podcast/davids-take-why-a-mantle-sold-for-329-400?utm_source=x'));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>David&#39;s Take: Why a Mantle Sold for \$329,400 \| Credabilia<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/credabilia\.com\/podcast\/davids-take-why-a-mantle-sold-for-329-400"/, 'tracking parameters never make a second address');
    assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large"/);
    assert.match(html, /<h1>David&#39;s Take: Why a Mantle Sold for \$329,400<\/h1>/);
    assert.match(html, /David’s Take · October 26, 2026 · 6 min/);
    assert.match(html, /In David’s Take, David Ortiz speaks as himself, in his real voice\./);
    assert.match(html, /<p>The record was about \$64,100\.<\/p>/);
    assert.match(html, /<h2>Sources<\/h2><ul><li><a href="https:\/\/news\.example\.com\/mantle" rel="noopener nofollow">/);
    assert.match(html, /<a href="\/podcast\/king-credions-court-ohtani">King Credion&#39;s Court: Ohtani<\/a>/);
    assert.match(html, /<a href="https:\/\/podcasters\.spotify\.com\/e1">Listen on Spotify<\/a>/);
    assert.match(html, /<a href="\/podcast">Podcast<\/a>/);
    assert.equal(f.requested.some(url => /get_storefront/.test(url)), false, 'an episode is never looked up as a store name');
  } finally { f.restore(); }
});

test('an episode not open to search engines is still a page but says noindex; an AI-hosted one says so truthfully', async () => {
  clearSeoCache();
  const f = withFetch({podcast_episode: () => ({body: {...EPISODE, kind: 'ai_hosted', index: false, sources: []}})});
  try {
    const html = await (await middleware(request('/podcast/davids-take-why-a-mantle-sold-for-329-400'))).text();
    assert.match(html, /<meta name="robots" content="noindex, follow"/);
    assert.match(html, /AI-hosted episode · October 26, 2026/);
    assert.match(html, /This is an AI-hosted episode\. The voices, including King Credion, David Ortiz, Hazel and Ericka, are cloned and generated with artificial intelligence\./);
    assert.doesNotMatch(html, /<h2>Sources<\/h2>/, 'no sources heading when there are none');
  } finally { f.restore(); }
});

test('an unknown, hidden or malformed episode address is a 404 for crawlers; a database hiccup is not mistaken for a missing page', async () => {
  clearSeoCache();
  let f = withFetch({podcast_episode: () => ({body: null})});
  try {
    const gone = await middleware(request('/podcast/no-such-episode'));
    assert.equal(gone.status, 404);
    assert.equal(gone.headers.get('x-robots-tag'), 'noindex');
    assert.equal((await middleware(request('/podcast/Bad_Slug'))).status, 404, 'only the lowercase address is the real one');
  } finally { f.restore(); }
  f = withFetch({podcast_episode: () => ({ok: false})});
  try {
    const response = await middleware(request('/podcast/davids-take-why-a-mantle-sold-for-329-400'));
    assert.equal(response.status, 200, 'the plain app shell is served instead of a wrong 404');
    assert.doesNotMatch(await response.text(), /<h1>/);
  } finally { f.restore(); }
});

test('nothing in an episode can become markup on the crawler page', async () => {
  clearSeoCache();
  const evil = {...EPISODE, title: '<script>alert(1)</script> "quoted"', summary: '<img src=x onerror=alert(1)>', body: '<b>bold</b>\n\n</main><script>steal()</script>', sources: ['https://good.example.com/a"><script>x()</script>'], related: [{slug: 'ok', title: '<i>x</i>', kind: 'ai_hosted'}]};
  const f = withFetch({podcast_episode: () => ({body: evil})});
  try {
    const html = await (await middleware(request('/podcast/davids-take-why-a-mantle-sold-for-329-400'))).text();
    assert.doesNotMatch(html, /<script>alert|<script>steal|<script>x\(\)|<img src=x|<i>x<\/i>|<b>bold/);
    assert.equal((html.match(/<script type="application\/ld\+json">/g) || []).length, 2, 'only our own two structured-data blocks');
    jsonLd(html);
  } finally { f.restore(); }
});

test('structured data is a valid PodcastEpisode that describes only what the page shows', () => {
  const json = episodeJsonLd(EPISODE);
  assert.equal(json['@type'], 'PodcastEpisode');
  assert.equal(json.url, 'https://credabilia.com/podcast/davids-take-why-a-mantle-sold-for-329-400');
  assert.equal(json.datePublished, '2026-10-26T17:27:00Z');
  assert.equal(json.dateModified, '2026-10-26T18:00:00Z');
  assert.equal(json.partOfSeries['@type'], 'PodcastSeries');
  assert.equal(json.partOfSeries.url, 'https://credabilia.com/podcast');
  assert.deepEqual(json.associatedMedia, {'@type': 'AudioObject', contentUrl: EPISODE.audio_url, encodingFormat: 'audio/mpeg', duration: 'PT5M39S'});
  assert.deepEqual(json.citation, EPISODE.sources);
  const bare = episodeJsonLd({slug: 's', title: 't', summary: 'x', published_at: '2026-10-26T17:27:00Z'});
  assert.ok(!('associatedMedia' in bare) && !('citation' in bare) && !('image' in bare), 'nothing is claimed that the episode does not have');
  assert.equal(bare.dateModified, '2026-10-26T17:27:00Z');
});

test('the sitemap lists only the episodes the database says are open to search engines, with their last real change, and a failed lookup never breaks the sitemap', async () => {
  const urls = sitemapUrls({listings: [], storefronts: [], podcast_episodes: [{slug: 'one', lastmod: '2026-10-26T18:00:00Z'}, {slug: 'two', lastmod: '2026-10-25T01:00:00Z'}]});
  assert.ok(urls.some(u => u.loc === 'https://credabilia.com/podcast/one' && u.lastmod === '2026-10-26'));
  assert.ok(urls.some(u => u.loc === 'https://credabilia.com/podcast/two'));
  assert.match(buildSitemapFiles({podcast_episodes: [{slug: 'one'}]}).files.main, /<loc>https:\/\/credabilia\.com\/podcast\/one<\/loc>/);
  clearSeoCache();
  let f = withFetch({sitemap_entries: () => ({body: {listings: [], storefronts: []}}), podcast_sitemap_entries: () => ({body: [{slug: 'one', lastmod: '2026-10-26T18:00:00Z'}]})});
  try {
    assert.match(await (await middleware(request('/sitemap.xml', 'Mozilla/5.0 Chrome/120'))).text(), /<loc>https:\/\/credabilia\.com\/podcast\/one<\/loc>\s*<lastmod>2026-10-26<\/lastmod>/);
  } finally { f.restore(); }
  clearSeoCache();
  f = withFetch({sitemap_entries: () => ({body: {listings: [], storefronts: []}}), podcast_sitemap_entries: () => ({ok: false})});
  try {
    const response = await middleware(request('/sitemap.xml', 'Mozilla/5.0 Chrome/120'));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<loc>https:\/\/credabilia\.com\/podcast<\/loc>/, 'the rest of the sitemap is still served');
  } finally { f.restore(); }
});

test('the podcast landing page lists the episodes for crawlers with links to each', async () => {
  clearSeoCache();
  const f = withFetch({podcast_episodes_list: () => ({body: [{slug: 'one', title: 'Episode One', published_at: '2026-10-26T17:27:00Z', kind: 'davids_take'}]})});
  try {
    const html = await (await middleware(request('/podcast'))).text();
    assert.match(html, /<h2>Episodes<\/h2><ul><li><a href="\/podcast\/one">Episode One<\/a> · October 26, 2026<\/li>/);
    assert.match(html, /"@type":"PodcastSeries"/);
  } finally { f.restore(); }
});

test('a long page title is cut at a word and never ends on a dash', async () => {
  const {shorten} = await import('../middleware.js');
  const cut = shorten('David’s Take: $2.16M for a Card That Doesn’t Exist Yet — Cooper Flagg 1/1 Motif Logoman', 62);
  assert.ok(cut.endsWith('Yet…'), cut);
  assert.equal(shorten('Short title', 62), 'Short title');
});

test('wording and formatting helpers', () => {
  assert.equal(formatDuration(339), '6 min');
  assert.equal(formatDuration(45), '1 min');
  assert.equal(formatDuration(4000), '1 hr 7 min');
  assert.equal(formatDuration(null), '');
  assert.equal(formatEpisodeDate('2026-10-26T23:59:00Z'), 'October 26, 2026', 'the date is the same in every time zone');
  assert.deepEqual(paragraphsOf('a\n\n\nb\n\n'), ['a', 'b']);
  assert.deepEqual(Object.keys(VOICE_NOTES), Object.keys(KIND_LABELS));
  assert.doesNotMatch(VOICE_NOTES.davids_take, /generated with artificial intelligence/, 'the morning show is not called AI-generated');
  assert.match(VOICE_NOTES.ai_hosted, /Ericka/);
  assert.match(PODCAST.aiNote, /David’s Take/);
});

test('the website routes the episode page, plays audio only on request, and the admin can open, close and hide episodes', async () => {
  const app = squash(await read('src/App.jsx')), legal = squash(await read('src/Legal.jsx')), admin = squash(await read('src/AdminPodcast.jsx'));
  assert.match(app, /\/\^\\\/podcast\\\/\[\^\/\]\+\\\/\?\$\/\.test\(window\.location\.pathname\) \? 'podcast-episode'/);
  assert.match(app, /if \(legalPage === 'podcast-episode'\) return <PodcastEpisodePage service=\{service\} slug=\{/);
  assert.match(app, /if \(legalPage === 'podcast'\) return <PodcastPage service=\{service\}\/>/);
  assert.match(app, /\{tab === 'podcast' && <AdminPodcast service=\{service\}\/>\}/);
  const page = legal.split('export function PodcastEpisodePage(')[1].split('// The invitation claim page')[0];
  assert.match(page, /<audio className="podcast-audio" controls preload="none" src=\{episode\.audio_url\}/, 'nothing is requested from the audio host until play is pressed');
  assert.doesNotMatch(page, /spotify\.com\/embed|<iframe/, 'no Spotify player code on the episode page');
  assert.match(page, /VOICE_NOTES\[episode\.kind\]/);
  assert.match(page, /rel="noopener noreferrer nofollow"/);
  assert.match(legal, /hosted by our podcast host, Spotify for Creators \(anchor\.fm\), and is only requested when you press play/, 'the Privacy Policy says so');
  assert.match(admin, /adminPodcastSetIndex\(e\.guid, 'index'\)/);
  assert.match(admin, /adminPodcastSetHidden/);
  const service = squash(await read('src/service.js')), demo = squash(await read('src/demo.js'));
  for (const method of ['podcastEpisodes', 'podcastEpisode', 'adminPodcastOverview', 'adminPodcastSetIndex', 'adminPodcastSetHidden']) {
    assert.match(service, new RegExp('async ' + method + '\\('), method + ' in the live service');
    assert.match(demo, new RegExp('async ' + method + '\\('), method + ' in the practice preview');
  }
});
