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
