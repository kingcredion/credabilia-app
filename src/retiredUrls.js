// Addresses the old Credabilia app had that this app does not. Without this, every unknown address shows the app's "Store not found" screen with a 200 status, so search
// engines keep such pages indexed. A path listed here answers 410 Gone to everyone (middleware.js).
//
// Where a retired page has a real replacement, do NOT add it here: add a permanent redirect to vercel.json instead (old page -> its closest new page). Never point retired pages at
// the home page just to be rid of them. Only address-level, signed-out-safe pages belong here; nothing in this list ever stood in front of an account or admin function.
export const RETIRED_PATHS = new Set([
  'adminapprovals', // old-app admin screen; still indexed from September 23
]);

// Compared case-insensitively, one path segment, trailing slash ignored.
export function retiredStatus(pathname) {
  const segments = String(pathname || '').split('/').filter(Boolean);
  return segments.length === 1 && RETIRED_PATHS.has(segments[0].toLowerCase()) ? 410 : 0;
}

export const GONE_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>This page is gone | Credabilia</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem"><h1>This page is gone</h1><p>It no longer exists on Credabilia.</p><p><a href="/">Go to the Credabilia home page</a></p></body></html>';
