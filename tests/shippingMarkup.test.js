import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shippingMarkupFactor} from '../supabase/functions/create-checkout-session/markup.js';

test('shipping markup: King\'s Collection is passed through at cost, everything else keeps 10%', () => {
  assert.equal(shippingMarkupFactor(true), 1);
  assert.equal(shippingMarkupFactor(false), 1.10);
  assert.equal(shippingMarkupFactor(null), 1.10); // rpc failed or listing unknown -> default markup, never silently free
  assert.equal(shippingMarkupFactor(undefined), 1.10);
  assert.equal(Math.round(1250 * shippingMarkupFactor(true)), 1250);
  assert.equal(Math.round(1250 * shippingMarkupFactor(false)), 1375);
});
