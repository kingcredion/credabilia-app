import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shouldStartMetaPixel, startMetaPixel, trackMeta, META_PIXEL_ID, META_EVENTS} from '../src/metaPixel.js';
import {trackEvent} from '../src/events.js';
import {requestSource} from '../src/founding.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');
const ID = '123456789012345';

// A tiny stand-in for the browser, enough to watch what the loader does.
function fakeBrowser(hostname) {
  const inserted = [];
  const script = {};
  globalThis.window = {location: {hostname}};
  globalThis.document = {createElement: () => script, getElementsByTagName: () => [{parentNode: {insertBefore: node => inserted.push(node)}}]};
  return {inserted, script};
}
function cleanup() { delete globalThis.window; delete globalThis.document; }

test('the pixel only starts with a real ID, on the real sites, outside Europe, and without a Global Privacy Control signal', () => {
  const ok = {pixelId: ID, hostname: 'credabilia.com', timeZone: 'America/Los_Angeles', globalPrivacyControl: false};
  assert.equal(shouldStartMetaPixel(ok), true);
  assert.equal(shouldStartMetaPixel({...ok, hostname: 'www.credabilia.app'}), true);
  assert.equal(shouldStartMetaPixel({...ok, pixelId: ''}), false, 'no ID yet');
  assert.equal(shouldStartMetaPixel({...ok, pixelId: 'abc'}), false, 'not a number');
  assert.equal(shouldStartMetaPixel({...ok, hostname: 'localhost'}), false);
  assert.equal(shouldStartMetaPixel({...ok, hostname: 'preview-1.vercel.app'}), false);
  assert.equal(shouldStartMetaPixel({...ok, hostname: 'credabilia.com.evil.test'}), false);
  assert.equal(shouldStartMetaPixel({...ok, timeZone: 'Europe/Paris'}), false);
  assert.equal(shouldStartMetaPixel({...ok, timeZone: 'Atlantic/Reykjavik'}), false);
  assert.equal(shouldStartMetaPixel({...ok, globalPrivacyControl: true}), false, 'an opt-out signal is honoured');
  assert.equal(shouldStartMetaPixel(), false);
});

test('as shipped, with no ID set, nothing loads', () => {
  assert.equal(META_PIXEL_ID, '', 'fill the real ID in src/metaPixel.js when Meta gives it');
  fakeBrowser('credabilia.com');
  try {
    assert.equal(startMetaPixel(), false);
    assert.equal(window.fbq, undefined);
  } finally { cleanup(); }
});

test('with an ID on the real site the loader is added, the pixel is initialised and one page view is reported, once', () => {
  const {inserted, script} = fakeBrowser('credabilia.com');
  try {
    assert.equal(startMetaPixel(ID, 'America/Denver'), true);
    assert.equal(inserted.length, 1);
    assert.equal(script.src, 'https://connect.facebook.net/en_US/fbevents.js');
    assert.deepEqual(window.fbq.queue.map(args => Array.from(args)), [['init', ID], ['track', 'PageView']]);
    assert.equal(startMetaPixel(ID, 'America/Denver'), false, 'starting twice does nothing');
    assert.equal(inserted.length, 1);
  } finally { cleanup(); }
});

test('the pixel never starts for Europe, localhost, or a browser asking not to be tracked', () => {
  fakeBrowser('credabilia.com');
  try { assert.equal(startMetaPixel(ID, 'Europe/Berlin'), false); assert.equal(window.fbq, undefined); } finally { cleanup(); }
  fakeBrowser('localhost');
  try { assert.equal(startMetaPixel(ID, 'America/Denver'), false); } finally { cleanup(); }
});

test('only two outcomes are ever sent to Meta, as standard events, with no details attached', () => {
  assert.deepEqual(META_EVENTS, {founding_request: 'Lead', sign_up: 'CompleteRegistration'});
  assert.equal(trackMeta('founding_request'), false, 'no pixel running, nothing sent');
  const calls = [];
  globalThis.window = {fbq: (...args) => calls.push(args)};
  try {
    assert.equal(trackMeta('founding_request'), true);
    assert.equal(trackMeta('sign_up'), true);
    assert.equal(trackMeta('listing_published'), false, 'other events are not shared with Meta');
    assert.equal(trackMeta('request_to_buy'), false);
    assert.equal(trackMeta('payout_setup_started'), false);
    assert.deepEqual(calls, [['track', 'Lead'], ['track', 'CompleteRegistration']]);
  } finally { cleanup(); }
});

test('a Founding request reaches Meta as a Lead only on the real site', () => {
  const calls = [];
  globalThis.window = {location: {hostname: 'credabilia.com'}, fbq: (...args) => calls.push(args)};
  try {
    trackEvent('founding_request');
    trackEvent('listing_published', {category: 'Sports'});
    assert.deepEqual(calls, [['track', 'Lead']]);
    window.location.hostname = 'localhost';
    trackEvent('founding_request');
    assert.equal(calls.length, 1, 'nothing from localhost');
  } finally { cleanup(); }
});

test('the pixel is started at launch, and the Privacy Policy says what it does', async () => {
  const main = squash(await read('src/main.jsx')), legal = squash(await read('src/Legal.jsx'));
  assert.match(main, /import \{ startMetaPixel \} from '\.\/metaPixel\.js';/);
  assert.match(main, /startClarity\(\);[\s\S]*startMetaPixel\(\);/);
  assert.match(legal, /we use the Meta pixel on credabilia\.com to measure which of those ads lead to actions/);
  assert.match(legal, /Global Privacy Control/);
  assert.match(legal, /<strong>Meta<\/strong>/);
  assert.match(legal, /We do not send Meta your name, email address/);
});

test('the request source is a short label from the link, never anything about the person', () => {
  assert.equal(requestSource('?utm_source=instagram&utm_medium=paid_social&utm_campaign=founding100'), 'instagram/founding100');
  assert.equal(requestSource('?utm_source=instagram'), 'instagram');
  assert.equal(requestSource('?fbclid=abc123'), 'meta');
  assert.equal(requestSource('?utm_source=ig&fbclid=abc123'), 'ig');
  assert.equal(requestSource(''), '');
  assert.equal(requestSource('?foo=bar'), '');
  assert.equal(requestSource('?utm_source=' + 'x'.repeat(300)).length, 100);
});
