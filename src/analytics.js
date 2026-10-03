// Google Ads conversion measurement. The Google tag itself is loaded in index.html (production hosts
// only); this file just reports the one outcome we want Google to learn from: someone successfully
// publishing a listing. Everything here is best-effort and must never break the real action.
const ITEM_LISTED = 'AW-17772928194/oCGSCKivzY8dEMK55ZpC';

export function trackItemListed(listingId) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
    // transaction_id lets Google drop a duplicate report for the same listing.
    window.gtag('event', 'conversion', { send_to: ITEM_LISTED, value: 1.0, currency: 'USD', transaction_id: String(listingId || '') });
    return true;
  } catch { return false; }
}
