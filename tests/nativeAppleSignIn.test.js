import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {usesNativeAppleSignIn, randomNonce, isAppleSignInCancelled} from '../src/nativeAuth.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');

function withCapacitor(capacitor, run) {
  const before = globalThis.Capacitor;
  globalThis.Capacitor = capacitor;
  try { return run(); } finally { globalThis.Capacitor = before; }
}

test('the system Apple sign-in sheet is used only in the iOS app, and only when the native plugin is really there', () => {
  assert.equal(usesNativeAppleSignIn(), false, 'plain website');
  assert.equal(withCapacitor({getPlatform: () => 'ios', isPluginAvailable: name => name === 'AppleSignIn'}, usesNativeAppleSignIn), true);
  assert.equal(withCapacitor({getPlatform: () => 'ios', isPluginAvailable: () => false}, usesNativeAppleSignIn), false, 'an older build without the plugin falls back to the browser route');
  assert.equal(withCapacitor({getPlatform: () => 'android', isPluginAvailable: () => true}, usesNativeAppleSignIn), false);
  assert.equal(withCapacitor({getPlatform: () => 'web', isPluginAvailable: () => true}, usesNativeAppleSignIn), false);
});

test('the nonce is long, hex and different every time; closing the Apple sheet is not an error message', () => {
  const a = randomNonce(), b = randomNonce();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  assert.equal(isAppleSignInCancelled({code: 'canceled', message: 'The operation couldn’t be completed.'}), true);
  assert.equal(isAppleSignInCancelled({message: 'The user canceled the authorization attempt'}), true);
  assert.equal(isAppleSignInCancelled({code: 'failed', message: 'Network error'}), false);
  assert.equal(isAppleSignInCancelled(null), false);
});

test('the app signs in with the Apple token directly, with the nonce, and keeps the browser route for the website and Android', async () => {
  const service = squash(await read('src/service.js'));
  assert.match(service, /if \(!usesNativeAppleSignIn\(\)\) \{ await oauthSignIn\(client, 'apple'\); return; \}/);
  assert.match(service, /registerPlugin\('AppleSignIn'\)\.authorize\(\{ nonce \}\)/);
  assert.match(service, /client\.auth\.signInWithIdToken\(\{ provider: 'apple', token: apple\.identityToken, nonce \}\)/);
  assert.match(service, /if \(isAppleSignInCancelled\(err\)\) return;/, 'cancelling is silent');
  assert.match(service, /catch \{ \/\* the name is a nicety, never a reason to fail the sign-in \*\/ \}/);
});

test('the iOS app carries the Sign in with Apple entitlement and registers the native plugin on the same name the app asks for', async () => {
  const entitlements = await read('ios/App/App/App.entitlements');
  assert.match(entitlements, /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>\s*<\/array>/);
  const project = await read('ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2, 'Debug and Release');
  const swift = squash(await read('ios/App/App/SceneDelegate.swift'));
  assert.match(swift, /window\?\.rootViewController = MainViewController\(\)/);
  assert.match(swift, /class MainViewController: CAPBridgeViewController[\s\S]*bridge\?\.registerPluginInstance\(AppleSignInPlugin\(\)\)/);
  assert.match(swift, /public let jsName = "AppleSignIn"/);
  assert.match(swift, /CAPPluginMethod\(name: "authorize", returnType: CAPPluginReturnPromise\)/);
  assert.match(swift, /controller\.presentationContextProvider = self/, 'the sheet needs a window to open on, which is what iPad requires');
  assert.match(swift, /request\.nonce = AppleSignInPlugin\.sha256Hex\(nonce\)/, 'Apple gets the hash, Supabase the original');
  assert.match(swift, /code == \.canceled \? "canceled" : "failed"/);
  assert.doesNotMatch(swift, /identityToken!|authorizationCode!/, 'no force-unwrapped tokens');
});

test('the Supabase Apple provider accepts tokens issued to the app itself (its bundle id is one of the allowed client ids)', async () => {
  const guide = await read('docs/apple-sign-in-setup.md');
  assert.match(guide, /com\.credabilia\.app/);
});
