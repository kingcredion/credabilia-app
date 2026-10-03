import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackItemListed} from '../src/analytics.js';

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
