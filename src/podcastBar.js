// The thin podcast bar under the site header on Discover: a megaphone that links to /podcast. Everything that decides WHO sees it lives here so it can be tested without the app.
export const PODCAST_BAR_DISMISS_KEY = 'credabilia.podcastBarDismissedUntil';
const DAY = 86400000;
export const PODCAST_BAR_SNOOZE_DAYS = 14;
export const PODCAST_BAR_TEXT = 'Listen to The Memorabilia Kingdom Podcast';

export function podcastBarDismissedUntil(win = typeof window === 'undefined' ? null : window) {
  try { return Number(win?.localStorage?.getItem(PODCAST_BAR_DISMISS_KEY)) || 0; } catch { return 0; }
}
export function dismissPodcastBar(win = typeof window === 'undefined' ? null : window, now = Date.now()) {
  try { win?.localStorage?.setItem(PODCAST_BAR_DISMISS_KEY, String(now + PODCAST_BAR_SNOOZE_DAYS * DAY)); } catch { /* private window: the bar just comes back next visit */ }
}

// Discover only, on the website only: the phone apps carry their own bundle and /podcast is a website page, so the apps never show the bar.
export function shouldShowPodcastBar({ workspace, native, dismissedUntil = 0, now = Date.now() }) {
  if (native) return false;
  if (workspace !== 'collector') return false;
  return dismissedUntil <= now;
}
