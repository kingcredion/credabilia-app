// Addresses the old Credabilia app had that this app does not. Without this, every unknown address shows the app's "Store not found" screen with a 200 status, so search
// engines keep such pages listed. A path in RETIRED_PATHS answers 410 Gone to everyone (middleware.js). One with a real replacement is redirected permanently instead, and is
// never sent to the home page just to be rid of it. Only address-level pages belong here; nothing in these lists ever stood in front of an account or admin function.
export const RETIRED_PATHS = new Set([
  'adminapprovals', // old-app admin screen; still indexed from September 23
  'admintickets', 'adminonboardingpreview', 'adminkickstarterinvestors', // old-app admin screens (Search Console: duplicate / crawled, not indexed)
  'itemdetails', // old-app item page (?id=...); items now live at /item/<id>, which these ids do not map to
  'resetpassword', 'reset-password', 'frameshopdashboard', 'frame-shop-dashboard', 'rewardcenter', 'influencer-profile', 'trivia-challenge', 'triviachallenge', 'myvets', 'myaudits',
]);

// Retired addresses that do have a real replacement: permanent redirects, compared case-insensitively.
export const RETIRED_REDIRECTS = new Map([
  ['home', '/'], // the old app's home page
  ['refundpolicy', '/terms'], // refunds are covered in the Terms of Service
]);

// The app's own single-address pages are lowercase. A capitalised spelling (/Terms) is the same page: one permanent redirect, so there is one address to index.
const LOWERCASE_PAGES = new Set(['terms', 'privacy', 'help', 'certificate', 'sell', 'podcast', 'giveaway-rules']);

const segmentsOf = pathname => String(pathname || '').split('/').filter(Boolean);

// 410 for a retired path, else 0. One path segment, case-insensitive, trailing slash ignored.
export function retiredStatus(pathname) {
  const segments = segmentsOf(pathname);
  return segments.length === 1 && RETIRED_PATHS.has(segments[0].toLowerCase()) ? 410 : 0;
}

// Where a retired or wrongly-capitalised address should permanently go, or null.
export function redirectTarget(pathname) {
  const segments = segmentsOf(pathname);
  if (segments.length !== 1) return null;
  const lower = segments[0].toLowerCase();
  if (RETIRED_REDIRECTS.has(lower)) return RETIRED_REDIRECTS.get(lower);
  return LOWERCASE_PAGES.has(lower) && segments[0] !== lower ? '/' + lower : null;
}

export const GONE_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>This page is gone | Credabilia</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem"><h1>This page is gone</h1><p>It no longer exists on Credabilia.</p><p><a href="/">Go to the Credabilia home page</a></p></body></html>';
