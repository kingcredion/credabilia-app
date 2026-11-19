import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {usesNativeWebAuthSession, isAppleSignInCancelled} from '../src/nativeAuth.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');

function withCapacitor(capacitor, run) {
  const before = globalThis.Capacitor;
  globalThis.Capacitor = capacitor;
  try { return run(); } finally { globalThis.Capacitor = before; }
}

test('Apple\'s web-sign-in window is used only in the iOS app, and only when the native plugin is really there', () => {
  assert.equal(usesNativeWebAuthSession(), false, 'plain website');
  assert.equal(withCapacitor({getPlatform: () => 'ios', isPluginAvailable: name => name === 'WebAuthSession'}, usesNativeWebAuthSession), true);
  assert.equal(withCapacitor({getPlatform: () => 'ios', isPluginAvailable: () => false}, usesNativeWebAuthSession), false, 'an older iPhone build falls back to the browser route');
  assert.equal(withCapacitor({getPlatform: () => 'android', isPluginAvailable: () => true}, usesNativeWebAuthSession), false, 'Android keeps the browser route');
  assert.equal(withCapacitor({getPlatform: () => 'web', isPluginAvailable: () => true}, usesNativeWebAuthSession), false);
  assert.equal(isAppleSignInCancelled({code: 'canceled', message: 'The user canceled'}), true, 'closing the window is not an error message');
});

test('the app opens the provider page in that window, finishes the sign-in with the returned code, and keeps the browser route as the fallback', async () => {
  const service = squash(await read('src/service.js'));
  assert.match(service, /if \(usesNativeWebAuthSession\(\)\) \{/);
  assert.match(service, /registerPlugin\('WebAuthSession'\)/);
  assert.match(service, /webAuthSession\.start\(\{ url: data\.url, callbackScheme: new URL\(NATIVE_REDIRECT\)\.protocol\.replace\(':', ''\) \}\)/);
  assert.match(service, /if \(isAppleSignInCancelled\(err\)\) return;/, 'cancelling is silent');
  assert.match(service, /await finishNativeSignIn\(client, result\?\.url\);/);
  assert.match(service, /export async function finishNativeSignIn\(client, link\)[\s\S]*exchangeCodeForSession\(result\.code\)/);
  assert.match(service, /const \{ Browser \} = await import\('@capacitor\/browser'\);\n  await Browser\.open\(\{ url: data\.url \}\);/, 'Android and older iPhone builds still use the browser');
  assert.match(service, /redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true/);
});

test('the iOS app registers the web-sign-in plugin under the name the app asks for, with a window to open on', async () => {
  const swift = squash(await read('ios/App/App/SceneDelegate.swift'));
  assert.match(swift, /bridge\?\.registerPluginInstance\(WebAuthSessionPlugin\(\)\)/);
  assert.match(swift, /bridge\?\.registerPluginInstance\(AppleSignInPlugin\(\)\)/, 'the Apple plugin is untouched');
  assert.match(swift, /public let jsName = "WebAuthSession"/);
  assert.match(swift, /CAPPluginMethod\(name: "start", returnType: CAPPluginReturnPromise\)/);
  assert.match(swift, /ASWebAuthenticationSession\(url: url, callbackURLScheme: scheme\)/);
  assert.match(swift, /session\.presentationContextProvider = self/, 'iPad needs a window to open on');
  assert.match(swift, /ASWebAuthenticationPresentationContextProviding/);
  assert.match(swift, /code == \.canceledLogin \? "canceled" : "failed"/);
  assert.match(swift, /call\.resolve\(\["url": callbackURL\.absoluteString\]\)/);
  assert.match(swift, /self\.bridge\?\.releaseCall\(call\)/);
});
