import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {minAgeFor, oddsLine, GIVEAWAY_EXCLUDED_STATES, US_STATES, eligibleStates, statesNote, GIVEAWAY_INTENT_KEY, REFERRAL_KEY, captureGiveawayParam, captureReferralParam, clearGiveawayIntent, clearReferral, elapsedPercent, hasFreshGiveawayIntent,
  readReferral, referralLink, rememberGiveawayIntent, rememberReferral, ticketLine, timeLeft} from '../src/giveaway.js';

function fakeWindow(url = 'https://credabilia.com/') {
  const store = new Map(); const u = new URL(url); const replaced = [];
  return {localStorage: {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)},
    location: {search: u.search, pathname: u.pathname, hash: u.hash}, history: {replaceState: (_s, _t, to) => replaced.push(to)}, replaced, store};
}
const DAY = 86400000;

test('tapping Enter while signed out is remembered for a day, then forgotten', () => {
  const win = fakeWindow(); const now = Date.now();
  assert.equal(hasFreshGiveawayIntent(win, now), false);
  rememberGiveawayIntent(win, now);
  assert.equal(hasFreshGiveawayIntent(win, now + 23 * 3600000), true);
  assert.equal(hasFreshGiveawayIntent(win, now + 25 * 3600000), false);
  clearGiveawayIntent(win);
  assert.equal(win.localStorage.getItem(GIVEAWAY_INTENT_KEY), null);
});

test('a shared ?giveaway=1 link becomes the same stored intent and the address bar is tidied; other links are left alone', () => {
  const win = fakeWindow('https://credabilia.com/?giveaway=1&utm_source=x');
  assert.equal(captureGiveawayParam(win), true);
  assert.equal(hasFreshGiveawayIntent(win), true);
  assert.deepEqual(win.replaced, ['/?utm_source=x']);
  const other = fakeWindow('https://credabilia.com/?giveaway=0');
  assert.equal(captureGiveawayParam(other), false);
  assert.equal(hasFreshGiveawayIntent(other), false);
});

test('referral: the first storefront wins, it lasts 30 days, and only plain names are accepted', () => {
  const win = fakeWindow(); const now = Date.now();
  assert.equal(rememberReferral({slug: 'Alex-Shop'}, win, now), true);
  assert.equal(rememberReferral({slug: 'someone-else'}, win, now + 1000), false); // first touch wins
  assert.deepEqual(readReferral(win, now + 29 * DAY), {slug: 'alex-shop', code: null});
  assert.equal(readReferral(win, now + 31 * DAY), null);
  clearReferral(win);
  assert.equal(win.localStorage.getItem(REFERRAL_KEY), null);
  for (const bad of [{slug: ''}, {slug: 'a b'}, {slug: '<script>'}, {code: 'x'.repeat(61)}, {}]) assert.equal(rememberReferral(bad, fakeWindow()), false);
});

test('a ?ref= code is remembered and removed from the address bar', () => {
  const win = fakeWindow('https://credabilia.com/?ref=ab12cd34&x=1');
  assert.equal(captureReferralParam(win), true);
  assert.deepEqual(readReferral(win), {slug: null, code: 'ab12cd34'});
  assert.deepEqual(win.replaced, ['/?x=1']);
  assert.equal(captureReferralParam(fakeWindow('https://credabilia.com/')), false);
});

test('the invite link uses the store name when there is one, otherwise the code', () => {
  assert.equal(referralLink({slug: 'alexshop', code: 'ab12cd34'}), 'https://credabilia.com/alexshop');
  assert.equal(referralLink({slug: null, code: 'ab12cd34'}), 'https://credabilia.com/?ref=ab12cd34');
  assert.equal(referralLink(null), '');
});

test('time left and the progress bar are honest', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  assert.equal(timeLeft(new Date(now + 5 * 3600000), now), '5 hours left');
  assert.equal(timeLeft(new Date(now + 1 * DAY + 3600000), now), '1 day left');
  assert.equal(timeLeft(new Date(now + 12 * DAY), now), '12 days left');
  assert.equal(timeLeft(new Date(now + 132 * DAY), now), '4 months, 12 days left');
  assert.equal(timeLeft(new Date(now - 1000), now), 'Ended');
  const g = {starts_at: new Date(now - 10 * DAY).toISOString(), ends_at: new Date(now + 30 * DAY).toISOString()};
  assert.equal(elapsedPercent(g, now), 25);
  assert.equal(elapsedPercent({starts_at: g.ends_at, ends_at: g.starts_at}, now), 0);
  assert.equal(elapsedPercent(g, now + 100 * DAY), 100);
});

test('the ticket sentence explains where tickets came from, and says when Stripe is still needed', () => {
  assert.equal(ticketLine(null), '');
  assert.equal(ticketLine({entered: false}), '');
  assert.match(ticketLine({entered: true, ready: false}), /Finish payout setup/);
  assert.equal(ticketLine({entered: true, ready: true, signup: 1, listings: 3, referrals: 2, tickets: 6}), 'You have 6 tickets: 1 for entering, 3 for listings, 2 for referrals.');
  assert.equal(ticketLine({entered: true, ready: true, signup: 1, listings: 1, referrals: 0, tickets: 2}), 'You have 2 tickets: 1 for entering, 1 for a listing.');
});

// The pieces have to stay connected to the app: the pinned card, the prize page without buy buttons, the hidden grid item, the admin tab and the storefront carousel.
test('the giveaway is wired into the app', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('<GiveawayCard giveaway={giveaway}'));
  assert.ok(app.includes('giveaway && selected.id === giveaway.listing_id ? <GiveawayPanel'), 'the prize page shows the giveaway panel instead of the buy buttons');
  assert.ok(app.includes('item.id === giveaway.listing_id && item.seller_id !== session?.user.id'), 'the prize is hidden from the normal grid');
  assert.ok(app.includes("<GiveawayAdmin service={service}/>"));
  assert.ok(app.includes('isAdminUser && selected.king_collection && <GiveawayItemControl'), 'the item page gives the admin (only) a switch for a King\'s Collection item');
  assert.ok(app.includes("const isAdminUser = session?.user?.email === 'kingcredion@credabilia.com'"));
  assert.ok(app.includes("setModal('giveaway-enter')") && app.includes("rememberGiveawayIntent(); setModal('login')"));
  assert.ok(app.includes("'/giveaway-rules' ? 'giveaway-rules'"));
  const storefront = readFileSync(new URL('../src/Storefront.jsx', import.meta.url), 'utf8');
  assert.ok(storefront.includes('EmptyStoreCarousel') && storefront.includes('rememberReferral'));
  const rules = readFileSync(new URL('../src/Legal.jsx', import.meta.url), 'utf8');
  assert.ok(rules.includes('NO PURCHASE NECESSARY') && rules.includes('is not involved in the activity in any manner') && rules.includes('Apple Inc. is not a sponsor'), 'Apple 5.3.2 wording');
  assert.ok(rules.includes('within 30 days after the winner confirms') && rules.includes('does not end early') && rules.includes('By email.'));
  assert.ok(!rules.includes('COUNSEL') && !rules.includes('DRAFT'));
  assert.ok(rules.includes('is under $5,000.') && !rules.includes('under ,000'), 'the prize-value limit is stated');
  const css = readFileSync(new URL('../src/giveaway.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion/);
});

test('the carousel and the item page never present the prize as an ordinary item with a price', () => {
  const component = readFileSync(new URL('../src/Giveaway.jsx', import.meta.url), 'utf8');
  assert.ok(component.includes('item.id !== giveaway?.listing_id'));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("!(giveaway && selected.id === giveaway.listing_id) && <p className=\"detail-price\">"));
});

// The blocked states and the list of valid states are enforced in the database and shown in the app; a test keeps the two copies identical.
test('the excluded states and the state list match the database', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610140142_giveaways.sql', import.meta.url), 'utf8');
  const defaults = sql.match(/excluded_states text\[\] not null default array\[([^\]]*)\]/)[1].match(/'([A-Z]{2})'/g).map(x => x.slice(1, 3));
  assert.deepEqual(defaults, GIVEAWAY_EXCLUDED_STATES);
  const list = sql.match(/any\(array\[('AL'[^\]]*)\]\)/)[1].match(/'([A-Z]{2})'/g).map(x => x.slice(1, 3));
  assert.deepEqual(list.slice().sort(), US_STATES.map(([code]) => code).sort());
  assert.equal(US_STATES.length, 51);
});

test('the states note names the excluded states and the picker leaves them out', () => {
  assert.equal(statesNote(), 'Open to residents of the 50 US states and DC, except Florida, New York and Rhode Island.');
  assert.equal(statesNote(['TX']), 'Open to residents of the 50 US states and DC, except Texas.');
  const codes = eligibleStates().map(([code]) => code);
  assert.equal(codes.length, 48);
  for (const blocked of GIVEAWAY_EXCLUDED_STATES) assert.ok(!codes.includes(blocked));
});

test('the giveaway cannot end early and takes free email entries', () => {
  const component = readFileSync(new URL('../src/Giveaway.jsx', import.meta.url), 'utf8');
  assert.ok(!component.includes('early_draw') && !component.includes('Optional: draw early'));
  assert.ok(component.includes('adminAddMailinEntry') && component.includes('adminRecordMailinClaim') && component.includes('State where you live'));
});

test('minimum age follows the state, and the odds sentence is honest', () => {
  assert.equal(minAgeFor('TX'), 18); assert.equal(minAgeFor('al'), 19); assert.equal(minAgeFor('NE'), 19); assert.equal(minAgeFor('MS'), 21); assert.equal(minAgeFor(''), 18);
  assert.match(oddsLine({tickets: 0}), /depend on how many tickets/);
  assert.match(oddsLine({tickets: 37, me: {tickets: 0}}), /One prize, 37 tickets entered so far/);
  assert.match(oddsLine({tickets: 1, me: null}), /1 ticket entered/);
  assert.equal(oddsLine({tickets: 1200, me: {tickets: 3}}), 'Your odds right now: 3 in 1,200 (one prize). They change as others enter.');
});

test('the rules carry the disclosures the state prize-promotion laws ask for', () => {
  const rules = readFileSync(new URL('../src/Legal.jsx', import.meta.url), 'utf8');
  for (const needle of ['19 in Alabama and Nebraska, 21 in Mississippi', 'Number of prizes: one', 'no other charges', 'The odds of winning cannot be known in advance', 'tickets divided by all tickets', 'available for 90 days after the end date', 'no sales presentation'.replace('no','There is no'), 'unless they have won']) assert.ok(rules.includes(needle), needle);
});
