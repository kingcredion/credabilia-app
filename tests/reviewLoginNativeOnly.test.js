import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = name => readFile(new URL('../src/' + name, import.meta.url), 'utf8');

test('the Review Team sign-in is for the phone apps only: the website never shows the button or honours the review address', async () => {
  const app = await read('App.jsx'), service = await read('service.js');
  assert.match(app, /if \(isNativeApp\(\)\) service\.reviewSignInAvailable\?\.\(\)\.then\(on => \{ if \(alive\) setReviewOpen\(!!on\); \}\)/, 'the button is only offered inside a native app');
  assert.match(service, /email\.trim\(\)\.toLowerCase\(\) === APP_REVIEW_EMAIL && isNativeApp\(\)/, 'the review address only bypasses the emailed code inside a native app');
});

test('the apps carry their own copy of the site, so web changes cannot affect what App Review sees', async () => {
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.webDir, 'dist');
  assert.equal(config.server?.url, undefined, 'the app must not load the live website');
});
