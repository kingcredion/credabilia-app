import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicOrigin, SITE_ORIGIN} from '../src/publicOrigin.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('on the web, shared links use the page\'s own address', () => {
  delete globalThis.Capacitor;
  assert.equal(publicOrigin({origin: 'https://credabilia.com'}), 'https://credabilia.com');
  assert.equal(publicOrigin({origin: 'http://localhost:5173'}), 'http://localhost:5173', 'the practice site keeps its own address');
});

test('inside the phone apps, shared links use the real website, never localhost', () => {
  try {
    globalThis.Capacitor = {isNativePlatform: () => true};
    assert.equal(publicOrigin({origin: 'capacitor://localhost'}), SITE_ORIGIN, 'iPhone app');
    assert.equal(publicOrigin({origin: 'https://localhost'}), SITE_ORIGIN, 'Android app');
  } finally { delete globalThis.Capacitor; }
  assert.equal(publicOrigin({origin: 'capacitor://localhost'}), SITE_ORIGIN, 'a non-web address is never shared even if the app check fails');
  assert.equal(SITE_ORIGIN, 'https://credabilia.com');
});

test('the storefront links in the app are built with it, not the raw page address', async () => {
  const app = (await read('src/App.jsx')).replace(/\r\n/g, '\n');
  assert.match(app, /import \{ publicOrigin \} from '\.\/publicOrigin\.js';/);
  assert.match(app, /const link = savedSlug \? `\$\{publicOrigin\(\)\}\/\$\{savedSlug\}` : '';/);
  assert.match(app, /const link = `\$\{publicOrigin\(\)\}\/\$\{slug\}`;/);
});
