import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LIST_INTENT_KEY, isSellHost, listUrl, captureListIntent} from '../src/listIntent.js';

test('isSellHost / listUrl: credabilia.app hands off to credabilia.com, everything else stays local', () => {
  assert.equal(isSellHost('credabilia.app'), true);
  assert.equal(isSellHost('www.credabilia.app'), true);
  assert.equal(isSellHost('credabilia.com'), false);
  assert.equal(isSellHost('evilcredabilia.app'), false);
  assert.equal(listUrl('credabilia.app'), 'https://credabilia.com/?list=1');
  assert.equal(listUrl('credabilia.com'), '/?list=1');
  assert.equal(listUrl('localhost'), '/?list=1');
});

function fakeWindow(search, hash = '') {
  const store = new Map(); let replaced = null;
  return { store, get replaced() { return replaced; },
    location: { search, hash, pathname: '/' },
    localStorage: { setItem: (k, v) => store.set(k, v) },
    history: { replaceState: (a, b, url) => { replaced = url; } } };
}

test('captureListIntent stores the intent and strips only the list param', () => {
  const w = fakeWindow('?gclid=abc&list=1');
  assert.equal(captureListIntent(w), true);
  assert.ok(Number(w.store.get(LIST_INTENT_KEY)) > 0);
  assert.equal(w.replaced, '/?gclid=abc');
  const plain = fakeWindow('?list=1', '#x');
  captureListIntent(plain);
  assert.equal(plain.replaced, '/#x');
});

test('captureListIntent ignores other arrivals and never throws', () => {
  const w = fakeWindow('?utm_source=ads');
  assert.equal(captureListIntent(w), false);
  assert.equal(w.store.size, 0);
  assert.equal(captureListIntent({}), false);
});
