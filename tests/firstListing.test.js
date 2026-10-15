import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRST_LISTING_DISMISS_KEY, FIRST_LISTING_SNOOZE_DAYS, PAYOUT_INTRO_NOTE, PAYOUT_INTRO_POINTS, dismissFirstListing, firstListingDismissedUntil, hasEverListed, shouldShowFirstListing} from '../src/firstListing.js';

const DAY = 86400000;
const fakeWindow = () => { const store = new Map(); return {localStorage: {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v))}, store}; };
const base = {live: true, session: {user: {id: 'me'}}, profile: {can_sell: true}, isAdmin: false, workspace: 'collector', hasListed: false, dismissedUntil: 0, now: 1000};

test('the first-listing card shows to a signed-in member who has never listed, on Discover', () => {
  assert.equal(shouldShowFirstListing(base), true);
});

test('it never shows to the operator, a signed-out visitor, someone who cannot sell, or in other workspaces', () => {
  assert.equal(shouldShowFirstListing({...base, isAdmin: true}), false);
  assert.equal(shouldShowFirstListing({...base, session: null}), false);
  assert.equal(shouldShowFirstListing({...base, profile: null}), false);
  assert.equal(shouldShowFirstListing({...base, profile: {can_sell: false}}), false);
  assert.equal(shouldShowFirstListing({...base, live: false}), false);
  for (const workspace of ['seller', 'auditor', 'messages']) assert.equal(shouldShowFirstListing({...base, workspace}), false);
});

test('anyone who has listed, had a listing end, or made a sale is not shown it', () => {
  assert.equal(hasEverListed({items: [{seller_id: 'someone'}], userId: 'me'}), false);
  assert.equal(hasEverListed({items: [{seller_id: 'me'}], userId: 'me'}), true);
  assert.equal(hasEverListed({endedListings: [{id: 1}], userId: 'me'}), true);
  assert.equal(hasEverListed({sales: [{id: 1}], userId: 'me'}), true);
  assert.equal(shouldShowFirstListing({...base, hasListed: true}), false);
});

test('"Not now" hides the card for three days, then it returns', () => {
  const win = fakeWindow(); const now = 5 * DAY;
  assert.equal(firstListingDismissedUntil(win), 0);
  dismissFirstListing(win, now);
  const until = firstListingDismissedUntil(win);
  assert.equal(until, now + FIRST_LISTING_SNOOZE_DAYS * DAY);
  assert.equal(FIRST_LISTING_SNOOZE_DAYS, 3);
  assert.equal(shouldShowFirstListing({...base, dismissedUntil: until, now: now + 2 * DAY}), false);
  assert.equal(shouldShowFirstListing({...base, dismissedUntil: until, now: now + 3 * DAY + 1}), true);
  assert.ok(win.store.has(FIRST_LISTING_DISMISS_KEY));
});

test('the payout intro tells people what Stripe asks for and that nothing is charged', () => {
  const text = PAYOUT_INTRO_POINTS.join(' ') + ' ' + PAYOUT_INTRO_NOTE;
  for (const needle of ['Stripe', 'never see', 'date of birth', 'bank account', 'about five minutes', 'nothing is charged', 'no setup fee']) assert.ok(text.toLowerCase().includes(needle.toLowerCase()), needle);
});

test('the card and the payout intro are wired into the app', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('showFirstListing && <FirstListingCard onStart={openCreate}'), 'the card opens the listing form');
  assert.ok(app.includes("setModal('payout-intro')") && app.includes('async function startPayoutOnboarding()'), 'Stripe opens only after the intro');
  assert.ok(app.includes("modal === 'payout-intro'") && app.includes('onContinue={() => { setModal(null); startPayoutOnboarding(); }}'));
  assert.ok(app.indexOf('const isAdminUser') < app.indexOf('const showFirstListing'), 'declared before it is used');
});
