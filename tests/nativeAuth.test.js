import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_REDIRECT, parseAuthRedirect, cleanEmailCode, EMAIL_CODE_LENGTH, isNativeApp } from '../src/nativeAuth.js';

test('the app only reads its own sign-in return link', () => {
  assert.deepEqual(parseAuthRedirect(`${NATIVE_REDIRECT}?code=abc123`), { code: 'abc123', error: null });
  assert.equal(parseAuthRedirect('https://credabilia.com/auth/callback?code=abc'), null);
  assert.equal(parseAuthRedirect('com.other.app://auth/callback?code=abc'), null);
  assert.equal(parseAuthRedirect(undefined), null);
  assert.equal(parseAuthRedirect(''), null);
});

test('a failed or cancelled sign-in carries its reason, from the query or the fragment', () => {
  assert.deepEqual(parseAuthRedirect(`${NATIVE_REDIRECT}?error=access_denied&error_description=User+cancelled`), { code: null, error: 'User cancelled' });
  assert.deepEqual(parseAuthRedirect(`${NATIVE_REDIRECT}#error=server_error&error_description=Email+link+is+invalid`), { code: null, error: 'Email link is invalid' });
  assert.deepEqual(parseAuthRedirect(`${NATIVE_REDIRECT}?error=access_denied`), { code: null, error: 'access_denied' });
  assert.deepEqual(parseAuthRedirect(NATIVE_REDIRECT), { code: null, error: null });
});

test('the emailed code is reduced to digits and is six long', () => {
  assert.equal(EMAIL_CODE_LENGTH, 6);
  assert.equal(cleanEmailCode(' 123 456 '), '123456');
  assert.equal(cleanEmailCode('123-456'), '123456');
  assert.equal(cleanEmailCode(' 1234 5678 '), '12345678', 'a longer code still survives, in case the setting changes');
  assert.equal(cleanEmailCode(null), '');
  assert.equal(cleanEmailCode('abc'), '');
});

test('a normal browser is not treated as the app', () => {
  assert.equal(isNativeApp(), false);
  globalThis.Capacitor = { isNativePlatform: () => true };
  assert.equal(isNativeApp(), true);
  delete globalThis.Capacitor;
});

import { externalLinkUrl } from '../src/nativeAuth.js';
test('outside web links open in the in-app browser, everything else is left alone', () => {
  const origin = 'capacitor://localhost';
  assert.equal(externalLinkUrl('https://track.example.com/abc', { origin }), 'https://track.example.com/abc');
  assert.equal(externalLinkUrl('https://credabilia.com/store/x', { origin, target: '_blank' }), 'https://credabilia.com/store/x');
  assert.equal(externalLinkUrl('/item/123', { origin: 'https://credabilia.com' }), null);
  assert.equal(externalLinkUrl('/item/123', { origin: 'https://credabilia.com', target: '_blank' }), 'https://credabilia.com/item/123');
  assert.equal(externalLinkUrl('mailto:support@credabilia.com', { origin }), null);
  assert.equal(externalLinkUrl('tel:+18667500255', { origin }), null);
  assert.equal(externalLinkUrl('com.credabilia.app://auth/callback?code=1', { origin }), null);
  assert.equal(externalLinkUrl('', { origin }), null);
  assert.equal(externalLinkUrl(undefined, { origin }), null);
});
