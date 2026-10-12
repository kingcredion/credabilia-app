// "Start listing" hand-off from the seller landing page (SellPage.jsx) into the main app.
export const LIST_INTENT_KEY = 'credabilia-list-intent';

// credabilia.app serves the seller landing page at its root (for ads); the app itself lives on credabilia.com.
export function isSellHost(hostname) { return /(^|\.)credabilia\.app$/i.test(hostname || ''); }

// A real link (not a script redirect) so Google's cross-domain linker can decorate it when it crosses
// from credabilia.app to credabilia.com -- that's what keeps the ad click attached to the later conversion.
export function listUrl(hostname) { return isSellHost(hostname) ? 'https://credabilia.com/?list=1' : '/?list=1'; }

// True while a "List your first item" arrival is still open (a stored intent younger than a day). The app uses it to show a
// focused hand-off screen, instead of the marketplace, until sign-in is done and the listing form can open.
export const LIST_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export function hasFreshListIntent(win = window, now = Date.now()) {
  try {
    const started = Number(win.localStorage.getItem(LIST_INTENT_KEY));
    return !!started && now - started <= LIST_INTENT_MAX_AGE_MS;
  } catch { return false; }
}

// Called once when the app loads: turns a ?list=1 arrival into a stored intent (the main app opens the
// listing form after sign-in, surviving the Google redirect) and tidies the address bar.
export function captureListIntent(win = window) {
  try {
    const params = new URLSearchParams(win.location.search);
    if (params.get('list') !== '1') return false;
    win.localStorage.setItem(LIST_INTENT_KEY, String(Date.now()));
    params.delete('list');
    const rest = params.toString();
    win.history.replaceState({}, '', win.location.pathname + (rest ? '?' + rest : '') + (win.location.hash || ''));
    return true;
  } catch { return false; }
}
