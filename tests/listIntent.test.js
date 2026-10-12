import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIST_INTENT_KEY, LIST_INTENT_MAX_AGE_MS, isSellHost, listUrl, captureListIntent, hasFreshListIntent} from '../src/listIntent.js';

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

function storedWindow(value) { return { localStorage: { getItem: () => value } }; }

test('hasFreshListIntent: true only for an intent stored less than a day ago', () => {
  const now = 1_000_000_000_000;
  assert.equal(hasFreshListIntent(storedWindow(String(now - 1000)), now), true);
  assert.equal(hasFreshListIntent(storedWindow(String(now - LIST_INTENT_MAX_AGE_MS)), now), true);
  assert.equal(hasFreshListIntent(storedWindow(String(now - LIST_INTENT_MAX_AGE_MS - 1)), now), false);
  assert.equal(hasFreshListIntent(storedWindow(null), now), false);
  assert.equal(hasFreshListIntent(storedWindow('not a number'), now), false);
  assert.equal(hasFreshListIntent({}, now), false); // storage unavailable: never throws
});

// The sign-in prompt for a visitor who clicked "List your first item" must not wait for the marketplace to finish loading (that wait
// used to show the unrelated home screen for seconds before the sign-in box appeared).
test('App: the list-intent prompt for a signed-out visitor does not wait on marketplace loading', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('const loginPrompted = useRef(false);');
  const end = app.indexOf('/?view=requests', start);
  assert.ok(start > 0 && end > start);
  const effect = app.slice(start, end);
  assert.ok(effect.includes('if (!authReady || storefrontSlug || legalPage) return;')); // no loading in the first guard
  assert.ok(effect.indexOf("setModal('login')") < effect.indexOf('if (loading || !profile) return;'));
  assert.ok(app.includes('className="list-handoff"'));
});
