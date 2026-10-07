import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackItemListed, trackSignUpIfNew} from '../src/analytics.js';

test('trackItemListed sends the Item listed conversion once with the listing id as transaction_id', () => {
  const calls = [];
  globalThis.window = { gtag: (...args) => calls.push(args) };
  assert.equal(trackItemListed('abc-123'), true);
  assert.deepEqual(calls, [['event', 'conversion', { send_to: 'AW-17772928194/oCGSCKivzY8dEMK55ZpC', value: 1.0, currency: 'USD', transaction_id: 'abc-123' }]]);
});

test('trackItemListed is a silent no-op without a tag, and never throws', () => {
  globalThis.window = {};
  assert.equal(trackItemListed('x'), false);
  globalThis.window = { gtag: () => { throw new Error('boom'); } };
  assert.equal(trackItemListed('x'), false);
  delete globalThis.window;
  assert.equal(trackItemListed('x'), false);
});

function windowWithStorage(calls) {
  const store = new Map();
  return { gtag: (...args) => calls.push(args), localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
}

test('trackSignUpIfNew reports a brand-new account once, as the secondary Sign-up conversion', () => {
  const calls = [];
  globalThis.window = windowWithStorage(calls);
  const now = Date.parse('2026-10-07T20:00:00Z');
  const user = { id: 'u1', created_at: '2026-10-07T19:58:00Z' };
  assert.equal(trackSignUpIfNew(user, now), true);
  assert.deepEqual(calls, [['event', 'conversion', { send_to: 'AW-17772928194/dKtGCM_-55QdEMK55ZpC', value: 1.0, currency: 'USD', transaction_id: 'signup-u1' }]]);
  assert.equal(trackSignUpIfNew(user, now), false, 'a second auth event in the same browser does not report again');
  assert.equal(calls.length, 1);
});

test('trackSignUpIfNew ignores returning users, missing users and bad dates', () => {
  const calls = [];
  globalThis.window = windowWithStorage(calls);
  const now = Date.parse('2026-10-07T20:00:00Z');
  assert.equal(trackSignUpIfNew({ id: 'old', created_at: '2026-10-01T10:00:00Z' }, now), false);
  assert.equal(trackSignUpIfNew({ id: 'future', created_at: '2026-10-08T10:00:00Z' }, now), false);
  assert.equal(trackSignUpIfNew({ id: 'nodate' }, now), false);
  assert.equal(trackSignUpIfNew(null, now), false);
  assert.equal(calls.length, 0);
  globalThis.window = {};
  assert.equal(trackSignUpIfNew({ id: 'u2', created_at: '2026-10-07T19:59:00Z' }, now), false, 'no tag, no report, no throw');
  delete globalThis.window;
  assert.equal(trackSignUpIfNew({ id: 'u2', created_at: '2026-10-07T19:59:00Z' }, now), false);
});
