// "List your first item": a card at the top of Discover, Sell and Audit for a member who has never listed, and the plain-language intro shown before the Stripe payout setup.
// Everything that decides WHO sees it lives here so it can be tested without the app.
export const FIRST_LISTING_DISMISS_KEY = 'credabilia.firstListingDismissedUntil';
const DAY = 86400000;
export const FIRST_LISTING_SNOOZE_DAYS = 3;

export function firstListingDismissedUntil(win = typeof window === 'undefined' ? null : window) {
  try { return Number(win?.localStorage?.getItem(FIRST_LISTING_DISMISS_KEY)) || 0; } catch { return 0; }
}
export function dismissFirstListing(win = typeof window === 'undefined' ? null : window, now = Date.now()) {
  try { win?.localStorage?.setItem(FIRST_LISTING_DISMISS_KEY, String(now + FIRST_LISTING_SNOOZE_DAYS * DAY)); } catch { /* private window: the card just comes back next visit */ }
}

// A member counts as having listed if they have any live listing, any ended one, or any sale: the card is for people who have not started at all.
export function hasEverListed({ items = [], endedListings = [], sales = [], userId }) {
  return items.some(item => item.seller_id === userId) || endedListings.length > 0 || sales.length > 0;
}

// Discover (collector), Sell (seller) and Audit (auditor); not the Messages inbox.
export const FIRST_LISTING_WORKSPACES = ['collector', 'seller', 'auditor'];

export function shouldShowFirstListing({ live, session, profile, isAdmin, workspace, hasListed, dismissedUntil = 0, now = Date.now() }) {
  if (!live || !session || !profile || isAdmin) return false;
  if (!FIRST_LISTING_WORKSPACES.includes(workspace)) return false;
  if (profile.can_sell === false) return false;
  if (hasListed) return false;
  return dismissedUntil <= now;
}

// What Stripe asks for, in plain words, so nobody is surprised when the Stripe page opens. Stripe collects and stores all of it; Credabilia never sees it.
export const PAYOUT_INTRO_POINTS = [
  'Stripe, our payment partner, runs this step. Credabilia never sees or stores your bank or ID details.',
  'It asks for your legal name, date of birth, home address, the last digits of your SSN, and a bank account or debit card for payouts.',
  'It takes about five minutes. You can stop and come back: nothing is charged and your listings stay saved.',
];
export const PAYOUT_INTRO_NOTE = 'Until it is finished, buyers can see your listings but cannot buy them. There is no setup fee. Credabilia only takes a fee when an item sells.';
