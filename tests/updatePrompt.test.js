import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchForNewVersion} from '../src/updatePrompt.js';

function fakes(controller) {
  const handlers = {}, docHandlers = {};
  let updates = 0, intervalFn = null;
  const serviceWorker = { controller, addEventListener: (n, f) => { handlers[n] = f; }, removeEventListener: n => { delete handlers[n]; }, getRegistration: async () => ({ update: async () => { updates++; } }) };
  const doc = { visibilityState: 'visible', addEventListener: (n, f) => { docHandlers[n] = f; }, removeEventListener: n => { delete docHandlers[n]; } };
  return { serviceWorker, doc, handlers, docHandlers, updates: () => updates, setIntervalFn: f => { intervalFn = f; return 1; }, clearIntervalFn: () => { intervalFn = null; }, tick: () => intervalFn?.() };
}

test('a new version is announced only when the page already had a worker; the first install is not an update', () => {
  let ready = 0;
  const first = fakes(null);
  watchForNewVersion(() => ready++, first);
  first.handlers.controllerchange(); assert.equal(ready, 0, 'first install');
  first.handlers.controllerchange(); assert.equal(ready, 1, 'a later change is an update');
  const already = fakes({});
  watchForNewVersion(() => ready++, already);
  already.handlers.controllerchange(); assert.equal(ready, 2);
});

test('it asks the browser to look for a new version on a timer and when the tab returns', async () => {
  const f = fakes({});
  const stop = watchForNewVersion(() => {}, f);
  f.tick(); await new Promise(r => setTimeout(r, 0)); assert.equal(f.updates(), 1);
  f.docHandlers.visibilitychange(); await new Promise(r => setTimeout(r, 0)); assert.equal(f.updates(), 2);
  f.doc.visibilityState = 'hidden'; f.docHandlers.visibilitychange(); await new Promise(r => setTimeout(r, 0)); assert.equal(f.updates(), 2, 'not while hidden');
  stop(); assert.equal(f.handlers.controllerchange, undefined);
});

test('without a service worker nothing happens', () => {
  assert.equal(typeof watchForNewVersion(() => {}, { serviceWorker: undefined }), 'function');
});
