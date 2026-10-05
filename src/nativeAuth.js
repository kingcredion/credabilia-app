// Sign-in plumbing for the iOS and Android apps (Capacitor). Google refuses to show its sign-in page inside an app's embedded web view, so on the
// phone the Google step opens in the system browser and comes back through this custom link; the app then finishes the sign-in with the code.
export const NATIVE_REDIRECT = 'com.credabilia.app://auth/callback';

export function isNativeApp() {
  try { return !!globalThis.Capacitor?.isNativePlatform?.(); } catch { return false; }
}

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

// The 8-digit code from the sign-in email, as typed (spaces and dashes are common when copying it).
export function cleanEmailCode(value) { return String(value || '').replace(/[^0-9]/g, ''); }
export const EMAIL_CODE_LENGTH = 8;
