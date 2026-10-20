import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {keptShare, cutoutIsTooSmall, MIN_KEPT_SHARE, MAX_PIXELS} from '../supabase/functions/remove-background/cutoutQuality.js';
import {createHandler as createRemove} from '../supabase/functions/remove-background/handler.js';
import {createHandler as createRetry} from '../supabase/functions/retry-background-removal/handler.js';

const {PNG} = createRequire(import.meta.url)('pngjs');

// A w x h picture whose top-left (kw x kh) corner is opaque and the rest see-through, with a gradient in the colour channels so every PNG filter has real work to do.
function cutout(w, h, kw, kh, options = {}) {
  const png = new PNG({width: w, height: h});
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    png.data[i] = (x * 5 + y * 3) & 255; png.data[i + 1] = (x * 2 + y * 7) & 255; png.data[i + 2] = (x * y) & 255;
    png.data[i + 3] = x < kw && y < kh ? 255 : 0;
  }
  return new Uint8Array(PNG.sync.write(png, options));
}

test('the share of the picture a cutout keeps is measured correctly, whatever PNG filter the encoder used', async () => {
  for (const filterType of [-1, 0, 1, 2, 3, 4]) {
    assert.equal(await keptShare(cutout(100, 80, 100, 80, {filterType})), 1, 'fully opaque, filter ' + filterType);
    assert.equal(await keptShare(cutout(100, 80, 0, 0, {filterType})), 0, 'fully see-through, filter ' + filterType);
    assert.equal(await keptShare(cutout(100, 80, 50, 40, {filterType})), 0.25, 'a quarter kept, filter ' + filterType);
  }
});

test('semi-transparent edge pixels do not count as kept, and a gray-plus-alpha PNG is read too', async () => {
  const half = new PNG({width: 10, height: 10}); half.data.fill(255);
  for (let i = 3; i < half.data.length; i += 4) half.data[i] = 100;
  assert.equal(await keptShare(new Uint8Array(PNG.sync.write(half))), 0, 'alpha 100 is below the 128 line');
  const gray = new PNG({width: 20, height: 20}); gray.data.fill(0);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) { const i = (y * 20 + x) * 4; gray.data[i] = gray.data[i + 1] = gray.data[i + 2] = 120; gray.data[i + 3] = x < 10 ? 255 : 0; }
  assert.equal(await keptShare(new Uint8Array(PNG.sync.write(gray, {colorType: 4, inputColorType: 6, inputHasAlpha: true}))), 0.5);
});

test('anything it cannot judge is reported as unknown, never as too small', async () => {
  assert.equal(await keptShare(new Uint8Array([1, 2, 3])), null, 'not a PNG at all');
  assert.equal(await keptShare(new Uint8Array(0)), null);
  assert.equal(await keptShare(new Uint8Array([255, 216, 255, 224, 0, 16])), null, 'a JPEG');
  const sixteen = new Uint8Array(PNG.sync.write(Object.assign(new PNG({width: 8, height: 8}), {}), {bitDepth: 16, colorType: 6, inputColorType: 6, inputHasAlpha: true}));
  assert.equal(await keptShare(sixteen), null, '16-bit is not read');
  const truncated = cutout(60, 60, 30, 30).slice(0, 120);
  assert.equal(await keptShare(truncated), null, 'a damaged file');
  assert.equal(cutoutIsTooSmall(null), false);
  assert.equal(cutoutIsTooSmall(undefined), false);
});

test('a very large image is not judged at all, so the check can never run past the time budget of the function', async () => {
  const huge = cutout(60, 60, 5, 5);
  const view = new DataView(huge.buffer, huge.byteOffset, huge.byteLength);
  view.setUint32(16, 4000); view.setUint32(20, 3000); // IHDR width and height: 12 million pixels
  assert.ok(4000 * 3000 > MAX_PIXELS);
  assert.equal(await keptShare(huge), null, 'accepted as before, with no decoding');
  assert.ok(1800 * 1800 < MAX_PIXELS, 'a normal listing photo is well inside the limit');
});

test('the line sits between the real bad cutout and the smallest healthy one', () => {
  assert.ok(MIN_KEPT_SHARE > 0.044, 'the distorted Packers photo kept 4.4% and must be caught');
  assert.ok(MIN_KEPT_SHARE < 0.104, 'the smallest healthy main photo (a signed baseball) kept 10.4% and must pass');
  assert.equal(cutoutIsTooSmall(0.044), true);
  assert.equal(cutoutIsTooSmall(0.104), false);
  assert.equal(cutoutIsTooSmall(0.5), false);
});

const ID = '11111111-1111-4111-8111-111111111111', PATH = ID + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
const removeHandler = png => createRemove({
  env: key => (key === 'PHOTOROOM_API_KEY' ? 'test-key' : 'test'),
  createClient: () => ({auth: {getUser: async () => ({data: {user: {id: ID}}})}, storage: {from: () => ({download: async () => ({data: new Blob([new Uint8Array([255, 216, 255, 0])], {type: 'image/jpeg'})})})}, rpc: async () => ({error: null})}),
  fetcher: async () => new Response(png, {status: 200}),
});
const ask = handler => handler(new Request('https://example.test', {method: 'POST', headers: {Authorization: 'Bearer test'}, body: JSON.stringify({path: PATH})}));

test('remove-background keeps the original photo (422, with a plain message) when the cutout keeps almost nothing, and passes a good cutout through', async () => {
  const bad = await ask(removeHandler(cutout(100, 100, 20, 20)));
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /kept your original photo/);
  const good = await ask(removeHandler(cutout(100, 100, 60, 60)));
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('Content-Type'), 'application/octet-stream');
  const small = await ask(removeHandler(cutout(100, 100, 33, 33)));
  assert.equal(small.status, 200, 'a genuinely small item (about 11% of the frame) is still accepted');
});

test('retry-background-removal gives up on a photo whose cutout keeps almost nothing: no upload, no swap, no more retries', async () => {
  const uploads = [], updates = [], removed = [];
  const service = {
    from: () => ({
      select: () => ({eq: () => ({eq: () => ({lt: () => ({limit: async () => ({data: [{path: PATH, bg_attempts: 1}], error: null})})})})}),
      update: fields => ({eq: async (col, val) => { updates.push({...fields, _where: val}); return {error: null}; }}),
    }),
    storage: {from: () => ({
      download: async () => ({data: new Blob([new Uint8Array([255, 216, 255, 0])], {type: 'image/jpeg'}), error: null}),
      upload: async path => { uploads.push(path); return {error: null}; },
      remove: async paths => { removed.push(...paths); return {error: null}; },
    })},
  };
  const run = png => createRetry({env: () => 'test-key', createClient: () => service, fetcher: async () => new Response(png, {status: 200})})(new Request('https://example.test', {method: 'POST'}));
  const result = await run(cutout(100, 100, 20, 20));
  assert.deepEqual(await result.json(), {processed: 1, succeeded: 0});
  assert.deepEqual(uploads, [], 'the bad cutout is never stored');
  assert.deepEqual(removed, [], 'the original is never removed');
  assert.deepEqual(updates, [{bg_pending: false, _where: PATH}], 'the row stops being retried and keeps its original photo');
  updates.length = 0;
  const good = await run(cutout(100, 100, 60, 60));
  assert.deepEqual(await good.json(), {processed: 1, succeeded: 1});
  assert.equal(uploads.length, 1);
  assert.equal(updates[0].bg_pending, false);
  assert.match(updates[0].path, /\.png$/);
});

test('the two copies of the quality check are identical, and both functions use it', async () => {
  const read = p => readFile(new URL('../supabase/functions/' + p, import.meta.url), 'utf8');
  assert.equal(await read('remove-background/cutoutQuality.js'), await read('retry-background-removal/cutoutQuality.js'));
  assert.match(await read('remove-background/handler.js'), /cutoutIsTooSmall\(await keptShare\(result\)\)/);
  assert.match(await read('retry-background-removal/handler.js'), /cutoutIsTooSmall\(await keptShare\(result\)\)/);
});
