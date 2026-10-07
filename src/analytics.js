// Google Ads conversion measurement. The Google tag itself is loaded in index.html (production hosts
// only); this file just reports the one outcome we want Google to learn from: someone successfully
// publishing a listing. Everything here is best-effort and must never break the real action.
const ITEM_LISTED = 'AW-17772928194/oCGSCKivzY8dEMK55ZpC';

// Secondary goal: a brand-new account. Not used for bidding (the campaign still optimizes for listings); it only shows in "All conversions".
const SIGN_UP = 'AW-17772928194/dKtGCM_-55QdEMK55ZpC';
const NEW_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

export function trackSignUp(userId) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
    window.gtag('event', 'conversion', { send_to: SIGN_UP, value: 1.0, currency: 'USD', transaction_id: `signup-${userId || ''}` });
    return true;
  } catch { return false; }
}

// Called with the signed-in user on every auth event. Reports only an account created in the last few minutes, and only once per browser;
// returning sign-ins, the App Review account and old accounts never count. Google also drops a repeat of the same transaction_id.
export function trackSignUpIfNew(user, now = Date.now()) {
  try {
    const created = Date.parse(user?.created_at || '');
    if (!user?.id || !Number.isFinite(created) || now - created > NEW_ACCOUNT_WINDOW_MS || now < created - 60000) return false;
    const key = `credabilia:signup-tracked:${user.id}`;
    try { if (window.localStorage.getItem(key)) return false; } catch { /* no storage: transaction_id still dedupes */ }
    const sent = trackSignUp(user.id);
    if (sent) { try { window.localStorage.setItem(key, '1'); } catch { /* fine */ } }
    return sent;
  } catch { return false; }
}

export function trackItemListed(listingId) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
    // transaction_id lets Google drop a duplicate report for the same listing.
    window.gtag('event', 'conversion', { send_to: ITEM_LISTED, value: 1.0, currency: 'USD', transaction_id: String(listingId || '') });
    return true;
  } catch { return false; }
}
