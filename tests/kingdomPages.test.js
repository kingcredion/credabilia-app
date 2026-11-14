import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler, storyPage, archivePage } from '../api/kingdom.js';

const env = name => ({ VITE_SUPABASE_URL: 'https://db.example', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk' })[name];
function run(handler, query) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, body, headers: this.headers }); } };
    handler({ query }, res);
  });
}
const story = { slug: 'mantle-card', title: 'A <Mantle> card', description: 'Why "it" sold', published_on: '2026-11-15',
  sections: [{ heading: 'The sale', text: 'It sold for $1 & change.', source: 'https://www.example.com/a?b=1' }, { text: 'Bad link paragraph here.', source: 'javascript:alert(1)' }] };

test('archive lists stories newest first from the database order and links each slug', async () => {
  let asked;
  const handler = createHandler({ env, fetcher: async url => { asked = url; return new Response(JSON.stringify([story, { slug: 'john-lennon-guitar', title: 'Lennon', description: 'd', published_on: '2026-11-14' }])); } });
  const r = await run(handler, {});
  assert.equal(r.status, 200);
  assert.match(asked, /order=published_on\.desc,created_at\.desc/);
  assert.ok(r.body.indexOf('/kingdom/mantle-card') < r.body.indexOf('/kingdom/john-lennon-guitar'));
  assert.match(r.body, /A &lt;Mantle&gt; card/);
});

test('story page escapes text, links https sources only, and 404s unknown or malformed slugs', async () => {
  const html = storyPage(story);
  assert.match(html, /<link rel="canonical" href="https:\/\/credabilia.com\/kingdom\/mantle-card">/);
  assert.match(html, /\$1 &amp; change\./);
  assert.match(html, /href="https:\/\/www.example.com\/a\?b=1"/);
  assert.doesNotMatch(html, /javascript:/);
  const empty = createHandler({ env, fetcher: async () => new Response('[]') });
  assert.equal((await run(empty, { slug: 'nope' })).status, 404);
  assert.equal((await run(empty, { slug: '../etc' })).status, 404);
});

test('database outage gives a 503 that is not cached', async () => {
  const handler = createHandler({ env, fetcher: async () => new Response('x', { status: 500 }) });
  const r = await run(handler, {});
  assert.equal(r.status, 503);
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('Lennon keeps its hand-built page; other story addresses go to the database page', () => {
  const rewrites = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url))).rewrites;
  const i = rewrites.findIndex(r => r.source === '/kingdom/john-lennon-guitar');
  const j = rewrites.findIndex(r => r.source === '/kingdom/:slug([a-z0-9-]+)');
  assert.ok(i >= 0 && i < j);
  assert.equal(rewrites[i].destination, '/kingdom/john-lennon-guitar.html');
  assert.equal(rewrites.find(r => r.source === '/kingdom').destination, '/api/kingdom');
  assert.ok(archivePage([]).includes('The Memorabilia Kingdom'));
});
