import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHandler} from '../api/email-image.js';

const ID = 'cb7382b2-aca3-4fc7-b90d-698c665c5437';
const env = name => ({VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk'})[name];

function fakeRes() {
  const res = {statusCode: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; }};
  return res;
}

async function bigPng() { return sharp({create: {width: 1170, height: 1694, channels: 4, background: {r: 200, g: 30, b: 30, alpha: 0.5}}}).png().toBuffer(); }

test('email-image: serves a resized JPEG for a listing photo', async () => {
  const png = await bigPng();
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push(url);
    if (url.endsWith('/rpc/get_listing_photo_path')) return {ok: true, json: async () => 'owner/photo.png'};
    if (opts?.method === 'POST' && url.includes('/object/sign/listing-media/owner/photo.png')) return {ok: true, json: async () => ({signedURL: '/object/sign/listing-media/owner/photo.png?token=t'})};
    return {ok: true, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)};
  };
  const res = fakeRes();
  await createHandler({env, fetcher})({query: {id: ID}}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  const meta = await sharp(res.body).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 640);
  assert.ok(res.body.length < png.length);
});

test('email-image: bad id, missing photo, or failures fall back to the crown icon without calling Supabase for a bad id', async () => {
  let called = 0;
  const failing = async () => { called++; return {ok: false}; };
  for (const query of [{id: 'not-a-uuid'}, {}, {id: ID}]) {
    const res = fakeRes();
    await createHandler({env, fetcher: failing})({query}, res);
    assert.equal(res.statusCode, 302);
    assert.match(res.headers.Location, /icon-512\.png$/);
  }
  assert.equal(called, 1); // only the valid-uuid request reached the (failing) photo lookup
});

async function serve(query) {
  const png = await bigPng();
  const fetcher = async (url, opts) => {
    if (url.endsWith('/rpc/get_listing_photo_path')) return {ok: true, json: async () => 'owner/photo.png'};
    if (opts?.method === 'POST' && url.includes('/object/sign/listing-media/owner/photo.png')) return {ok: true, json: async () => ({signedURL: '/object/sign/listing-media/owner/photo.png?token=t'})};
    return {ok: true, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)};
  };
  const res = fakeRes();
  await createHandler({env, fetcher})({query}, res);
  return {res, png};
}

test('email-image: ?fmt=webp serves a small transparent WebP for the apps, at the requested width', async () => {
  const {res, png} = await serve({id: ID, fmt: 'webp'});
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/webp');
  const meta = await sharp(res.body).metadata();
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 640);
  assert.equal(meta.hasAlpha, true, 'the photo keeps its transparent background');
  assert.ok(res.body.length < png.length);
  const narrow = await serve({id: ID, fmt: 'webp', w: '320'});
  assert.equal((await sharp(narrow.res.body).metadata()).width, 320);
  const huge = await serve({id: ID, fmt: ['webp'], w: '99999'});
  assert.ok((await sharp(huge.res.body).metadata()).width <= 1280, 'width is capped');
});

test('photo links: signed photo links use one shared lifetime of six hours, not a hard-coded hour', async () => {
  const {readFile} = await import('node:fs/promises');
  const source = await readFile(new URL('../src/service.js', import.meta.url), 'utf8');
  assert.match(source, /const MEDIA_LINK_SECONDS=21600;/);
  assert.equal(/createSignedUrls?\([^\n]*,3600\)/.test(source), false);
  assert.equal((source.match(/MEDIA_LINK_SECONDS\)/g) || []).length >= 5, true);
});
