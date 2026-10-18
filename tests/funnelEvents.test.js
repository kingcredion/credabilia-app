import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {trackEvent, FUNNEL_EVENTS} from '../src/events.js';
import {trackSignUpIfNew} from '../src/analytics.js';

const read = name => readFile(new URL('../src/' + name, import.meta.url), 'utf8');

test('the four funnel events are the only ones that can be sent, and nothing is sent off the real sites', () => {
  assert.deepEqual(FUNNEL_EVENTS, ['sign_up', 'listing_published', 'payout_setup_started', 'request_to_buy']);
  assert.equal(trackEvent('listing_published'), false, 'no window at all (tests, server)');
  globalThis.window = {location: {hostname: 'localhost'}};
  try {
    assert.equal(trackEvent('listing_published'), false, 'localhost is not reported');
    window.location.hostname = 'preview-123.vercel.app';
    assert.equal(trackEvent('sign_up'), false, 'previews are not reported');
    window.location.hostname = 'credabilia.com';
    assert.equal(trackEvent('some_other_event'), false, 'only the named funnel events are allowed');
  } finally { delete globalThis.window; }
});

test('on the real site an event goes to Vercel and to Clarity when Clarity is running, and a failure never breaks the action', () => {
  const clarityCalls = [];
  globalThis.window = {location: {hostname: 'credabilia.com'}, clarity: (...args) => clarityCalls.push(args)};
  try {
    const sent = trackEvent('request_to_buy', {category: 'Sports'});
    assert.equal(typeof sent, 'boolean', 'returns a boolean and never throws');
    if (sent) assert.deepEqual(clarityCalls, [['event', 'request_to_buy']]);
    window.clarity = () => { throw new Error('clarity broke'); };
    assert.doesNotThrow(() => trackEvent('request_to_buy'));
  } finally { delete globalThis.window; }
});

test('a new member is reported as sign_up through the existing new-account check, and returning members are not', () => {
  const store = new Map();
  const sent = [];
  globalThis.window = {location: {hostname: 'credabilia.com'}, localStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)}, gtag: (...args) => sent.push(args)};
  try {
    const now = Date.parse('2026-10-18T12:00:00Z');
    assert.equal(trackSignUpIfNew({id: 'u1', created_at: '2026-10-18T11:58:00Z', app_metadata: {provider: 'google'}}, now), true);
    assert.equal(trackSignUpIfNew({id: 'u1', created_at: '2026-10-18T11:58:00Z'}, now), false, 'once per account per browser');
    assert.equal(trackSignUpIfNew({id: 'u2', created_at: '2026-09-01T00:00:00Z'}, now), false, 'an old account is a returning member');
  } finally { delete globalThis.window; }
});

test('the funnel events are fired where the actions succeed, and carry only plain labels', async () => {
  const app = await read('App.jsx'), service = await read('service.js'), analytics = await read('analytics.js');
  assert.match(app, /await service\.requestToBuy\(listingId\);\r?\n\s*trackEvent\('request_to_buy', \{ category: selected\?\.category \|\| 'none' \}\);/, 'after the request is saved');
  assert.match(app, /trackEvent\('listing_published', \{ sale_type: listingType, category: form\.category \|\| 'none' \}\);/);
  assert.match(service, /throw new Error\(detail\?\.error \|\| 'Stripe onboarding is not available right now\.'\); \}\r?\n\s*trackEvent\('payout_setup_started'\);/, 'only after Stripe onboarding really started');
  assert.match(analytics, /trackEvent\('sign_up', \{ provider: user\.app_metadata\?\.provider \|\| 'email' \}\)/);
  for (const [file, text] of [['App.jsx', app], ['service.js', service], ['analytics.js', analytics]]) {
    for (const call of text.match(/trackEvent\([^\n]*\)/g) || []) assert.doesNotMatch(call, /(user\.email|full_name|price_cents|form\.price|listingId|\.id\b)/, file + ': ' + call + ' carries no personal data');
  }
});
