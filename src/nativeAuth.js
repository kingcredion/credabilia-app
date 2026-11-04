// Sign-in plumbing for the iOS and Android apps (Capacitor). Google refuses to show its sign-in page inside an app's embedded web view, so on the
// phone the Google step opens in the system browser and comes back through this custom link; the app then finishes the sign-in with the code.
export const NATIVE_REDIRECT = 'com.credabilia.app://auth/callback';

export function isNativeApp() {
  try { return !!globalThis.Capacitor?.isNativePlatform?.(); } catch { return false; }
}

// Sign in with Apple inside the iPhone and iPad app is done by the system itself (the native sheet, AppleSignIn in ios/App/App/SceneDelegate.swift), not by a web page in a
// browser that has to find its way back to the app: that round trip is what ended on a blank screen for App Review (build 7, iPad). The Apple sign-in sheet hands back a
// signed token that Supabase checks directly. Only on iOS; the website and Android keep the browser route.
export function usesNativeAppleSignIn() {
  try { return globalThis.Capacitor?.getPlatform?.() === 'ios' && !!globalThis.Capacitor?.isPluginAvailable?.('AppleSignIn'); } catch { return false; }
}

// A random one-time value tying the Apple token to this attempt. Apple receives its SHA-256 (the Swift side hashes it); Supabase receives it as it is and checks them.
export function randomNonce() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Closing the Apple sheet without choosing is not an error the member needs to read about.
export const isAppleSignInCancelled = err => /cancel/i.test(String(err?.code || '') + ' ' + String(err?.message || ''));

// Reads the link the system browser (or an emailed sign-in link) opened the app with. Returns null for any other link.
export function parseAuthRedirect(link) {
  if (typeof link !== 'string' || !link.startsWith(NATIVE_REDIRECT)) return null;
  let parsed;
  try { parsed = new URL(link); } catch { return null; }
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error_description') || fragment.get('error_description') || parsed.searchParams.get('error') || fragment.get('error');
  return { code: code || null, error: error || null };
}

// The code from the sign-in email, as typed (spaces and dashes are common when copying it). It is 6 digits (Supabase Auth > Email OTP length). The app accepts
// anything from 6 to 10 digits so a change to that setting never locks anyone out; Supabase itself rejects a wrong code.
export function cleanEmailCode(value) { return String(value || '').replace(/[^0-9]/g, ''); }
export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_MIN = 6, EMAIL_CODE_MAX = 10;

// Decides whether a tapped link is an outside web page that should open in the in-app browser (with a Done button) instead of replacing the app.
// Anything that is not http(s) (mailto:, tel:, the app's own sign-in link) is left to the system.
export function externalLinkUrl(href, { origin, target } = {}) {
  if (typeof href !== 'string' || !href.trim()) return null;
  let parsed;
  try { parsed = new URL(href, origin || 'http://localhost'); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (target === '_blank' || (origin && parsed.origin !== origin)) return parsed.href;
  return null;
}

// The address Apple's App Review team signs in with (only works while the review switch is on in the database).
export const APP_REVIEW_EMAIL = 'appreview@credabilia.com';
