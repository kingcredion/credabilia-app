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

test('the emailed code is reduced to digits and is eight long', () => {
  assert.equal(EMAIL_CODE_LENGTH, 8);
  assert.equal(cleanEmailCode(' 1234 5678 '), '12345678');
  assert.equal(cleanEmailCode('1234-5678'), '12345678');
  assert.equal(cleanEmailCode(null), '');
  assert.equal(cleanEmailCode('abc'), '');
});

test('a normal browser is not treated as the app', () => {
  assert.equal(isNativeApp(), false);
  globalThis.Capacitor = { isNativePlatform: () => true };
  assert.equal(isNativeApp(), true);
  delete globalThis.Capacitor;
});
