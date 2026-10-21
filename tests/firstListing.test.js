import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRST_LISTING_DISMISS_KEY, FIRST_LISTING_SNOOZE_DAYS, PAYOUT_INTRO_NOTE, PAYOUT_INTRO_POINTS, dismissFirstListing, firstListingDismissedUntil, hasEverListed, cleanStoreName, isValidStoreName, shareLinkFor, shouldCelebrateFirstListing, shouldShowFirstListing} from '../src/firstListing.js';

const DAY = 86400000;
const fakeWindow = () => { const store = new Map(); return {localStorage: {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v))}, store}; };
const base = {live: true, session: {user: {id: 'me'}}, profile: {can_sell: true}, isAdmin: false, workspace: 'collector', hasListed: false, dismissedUntil: 0, now: 1000};

test('the first-listing card shows to a signed-in member who has never listed, on Discover, Sell and Audit', () => {
  for (const workspace of ['collector', 'seller', 'auditor']) assert.equal(shouldShowFirstListing({...base, workspace}), true, workspace);
});

test('it never shows to the operator, a signed-out visitor, someone who cannot sell, or in the Messages inbox', () => {
  assert.equal(shouldShowFirstListing({...base, isAdmin: true}), false);
  assert.equal(shouldShowFirstListing({...base, session: null}), false);
  assert.equal(shouldShowFirstListing({...base, profile: null}), false);
  assert.equal(shouldShowFirstListing({...base, profile: {can_sell: false}}), false);
  assert.equal(shouldShowFirstListing({...base, live: false}), false);
  assert.equal(shouldShowFirstListing({...base, workspace: 'messages'}), false);
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
  assert.equal(app.split('showFirstListing && <FirstListingCard').length - 1, 2, 'on Discover and Sell, and on its own at the top of the Audit tab');
  assert.ok(app.indexOf('showFirstListing && <FirstListingCard') < app.indexOf('OBSERVATION OVER ASSUMPTION') || app.lastIndexOf('showFirstListing && <FirstListingCard') < app.indexOf('OBSERVATION OVER ASSUMPTION'), 'above the Audit tab header');
  assert.ok(app.includes("setModal('payout-intro')") && app.includes('async function startPayoutOnboarding()'), 'Stripe opens only after the intro');
  assert.ok(app.includes("modal === 'payout-intro'") && app.includes('onContinue={() => { setModal(null); startPayoutOnboarding(); }}'));
  assert.ok(app.indexOf('const isAdminUser') < app.indexOf('const showFirstListing'), 'declared before it is used');
});

test('the congratulations popup: first listing, payouts not connected, not held for review', () => {
  const ok = {live: true, profile: {stripe_charges_enabled: false}, held: false, hadListedBefore: false};
  assert.equal(shouldCelebrateFirstListing(ok), true);
  assert.equal(shouldCelebrateFirstListing({...ok, profile: {}}), true, 'a brand-new profile has no Stripe flag yet');
  assert.equal(shouldCelebrateFirstListing({...ok, profile: {stripe_charges_enabled: true}}), false, 'already able to be paid');
  assert.equal(shouldCelebrateFirstListing({...ok, hadListedBefore: true}), false, 'only the first listing is celebrated');
  assert.equal(shouldCelebrateFirstListing({...ok, held: true}), false, 'a listing held for review is not live yet');
  assert.equal(shouldCelebrateFirstListing({...ok, live: false}), false);
  assert.equal(shouldCelebrateFirstListing({...ok, profile: null}), false);
});

test('the celebration is wired in and reuses the sign-in stage and flakes', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("setModal(celebrate ? 'first-listing-celebrate' : null)") && app.includes("modal === 'first-listing-celebrate'"));
  assert.ok(app.includes('onSetUpPayouts={() => { setModal(null); beginPayoutSetup(); }}'), 'the button goes to the payout intro');
  const comp = readFileSync(new URL('../src/FirstListing.jsx', import.meta.url), 'utf8');
  assert.ok(comp.includes('<Sparks/>') && comp.includes('king-credion-first-listing-celebration-440.webp'));
  const css = readFileSync(new URL('../src/firstListing.css', import.meta.url), 'utf8');
  assert.ok(css.includes('animation: login-glow') && css.includes('animation: login-float') && /prefers-reduced-motion: reduce[^}]*celebrate-stage/.test(css), 'same animation as the login box, and calm for reduced motion');
});

test('the payout intro has the King Credion Stripe art, and the Profile settings button opens it too', () => {
  const comp = readFileSync(new URL('../src/FirstListing.jsx', import.meta.url), 'utf8');
  assert.ok(comp.includes('king-credion-stripe-payout-setup-360.webp') && comp.includes('payout-intro-stage'));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("onConnectPayouts={() => setModal('payout-intro')}") && app.includes('onClick={onConnectPayouts || connectStripe}'), 'Profile settings no longer skips the intro');
});

test('the popup shares the store link when there is one, otherwise the new listing (tagged with the invite code)', () => {
  assert.deepEqual(shareLinkFor({slug: 'alexshop', itemId: 'abc', code: 'zz9'}), {url: 'https://credabilia.com/alexshop', label: 'your store link'});
  assert.deepEqual(shareLinkFor({slug: null, itemId: 'abc', code: 'zz9'}), {url: 'https://credabilia.com/item/abc?ref=zz9', label: 'your listing link'});
  assert.equal(shareLinkFor({slug: null, itemId: 'abc'}).url, 'https://credabilia.com/item/abc', 'no code yet: a plain listing link');
  assert.equal(shareLinkFor({}).url, '', 'nothing to share: the section is hidden');
});

test('the congratulations popup carries the share section and gets the data it needs', () => {
  const comp = readFileSync(new URL('../src/FirstListing.jsx', import.meta.url), 'utf8');
  assert.ok(comp.includes('celebrate-share') && comp.includes('navigator.clipboard.writeText(share.url)') && comp.includes('navigator.share'));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('slug={profile?.slug} itemId={celebratedItemId} giveawayActive={!!giveaway}') && app.includes('setCelebratedItemId(celebrate ? id : null)'));
});

test('store names: 3 to 30 lowercase letters, numbers or hyphens, as the database requires', () => {
  assert.equal(cleanStoreName('  MyShop '), 'myshop');
  for (const ok of ['abc', 'my-shop', 'Shop2', 'a'.repeat(30)]) assert.equal(isValidStoreName(ok), true, ok);
  for (const bad of ['', 'ab', '-shop', 'my shop', 'shop!', 'a'.repeat(31), 'shöp']) assert.equal(isValidStoreName(bad), false, bad);
});

test('the popup lets a member choose a store name and uses it for the link straight away', () => {
  const comp = readFileSync(new URL('../src/FirstListing.jsx', import.meta.url), 'utf8');
  assert.ok(comp.includes('await service.updateStoreSlug(clean); setSavedSlug(clean)') && comp.includes("shareLinkFor({ slug: savedSlug, itemId, code })"));
  assert.ok(comp.includes('isValidStoreName(nameInput)') && comp.includes('role="alert"'));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('onStoreNameSaved={() => refresh()}'));
});
