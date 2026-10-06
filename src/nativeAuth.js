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

// The code from the sign-in email, as typed (spaces and dashes are common when copying it). It is 6 digits (Supabase Auth > Email OTP length). The app accepts
// anything from 6 to 10 digits so a change to that setting never locks anyone out; Supabase itself rejects a wrong code.
export function cleanEmailCode(value) { return String(value || '').replace(/[^0-9]/g, ''); }
export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_MIN = 6, EMAIL_CODE_MAX = 10;
