// Giveaway + referral plumbing that needs no React: remembering where a visitor came from, remembering that they tapped "Enter the giveaway" while signed out,
// and the numbers on the card (time left, how far through the period we are, the ticket breakdown). Design: docs/giveaway-and-tickets-spec.md.
export const GIVEAWAY_INTENT_KEY = 'credabilia-giveaway-intent';
export const REFERRAL_KEY = 'credabilia-referral';
export const GIVEAWAY_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const REFERRAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const read = (win, key) => { try { return win.localStorage.getItem(key); } catch { return null; } };
const write = (win, key, value) => { try { win.localStorage.setItem(key, value); } catch { /* private mode: the feature just does not remember */ } };
const remove = (win, key) => { try { win.localStorage.removeItem(key); } catch { /* same */ } };

// Signed-out visitor taps "Enter the giveaway": remember it through sign-in (which can leave the page, e.g. the Google redirect).
export function rememberGiveawayIntent(win = window, now = Date.now()) { write(win, GIVEAWAY_INTENT_KEY, String(now)); }
export function hasFreshGiveawayIntent(win = window, now = Date.now()) { const started = Number(read(win, GIVEAWAY_INTENT_KEY)); return !!started && now - started <= GIVEAWAY_INTENT_MAX_AGE_MS; }
export function clearGiveawayIntent(win = window) { remove(win, GIVEAWAY_INTENT_KEY); }
// A shared link like credabilia.com/?giveaway=1 becomes the same stored intent, and the address bar is tidied.
export function captureGiveawayParam(win = window) {
  try {
    const params = new URLSearchParams(win.location.search);
    if (params.get('giveaway') !== '1') return false;
    rememberGiveawayIntent(win);
    params.delete('giveaway');
    const rest = params.toString();
    win.history.replaceState({}, '', win.location.pathname + (rest ? '?' + rest : '') + (win.location.hash || ''));
    return true;
  } catch { return false; }
}

// Referral: the first storefront (or ?ref= code) a visitor arrives through is remembered for 30 days. The first one wins, matching the server.
export function rememberReferral({ slug, code } = {}, win = window, now = Date.now()) {
  const clean = String(slug || code || '').trim().toLowerCase();
  if (!clean || clean.length > 60 || !/^[a-z0-9-]+$/.test(clean)) return false;
  const existing = readReferral(win, now);
  if (existing) return false;
  write(win, REFERRAL_KEY, JSON.stringify({ [slug ? 'slug' : 'code']: clean, at: now }));
  return true;
}
export function readReferral(win = window, now = Date.now()) {
  try {
    const value = JSON.parse(read(win, REFERRAL_KEY) || 'null');
    if (!value || !(value.slug || value.code) || !value.at || now - value.at > REFERRAL_MAX_AGE_MS) return null;
    return { slug: value.slug || null, code: value.code || null };
  } catch { return null; }
}
export function clearReferral(win = window) { remove(win, REFERRAL_KEY); }
export function captureReferralParam(win = window) {
  try {
    const params = new URLSearchParams(win.location.search);
    const code = params.get('ref');
    if (!code) return false;
    rememberReferral({ code }, win);
    params.delete('ref');
    const rest = params.toString();
    win.history.replaceState({}, '', win.location.pathname + (rest ? '?' + rest : '') + (win.location.hash || ''));
    return true;
  } catch { return false; }
}
// The link a member shares: their store name when they have one, otherwise their referral code.
export function referralLink(info, origin = 'https://credabilia.com') {
  if (!info) return '';
  return info.slug ? `${origin}/${info.slug}` : info.code ? `${origin}/?ref=${info.code}` : '';
}

// "4 months, 12 days left" / "12 days left" / "5 hours left" / "Ends today".
export function timeLeft(endsAt, now = Date.now()) {
  const ms = new Date(endsAt).getTime() - now;
  if (!(ms > 0)) return 'Ended';
  const days = Math.floor(ms / 86400000);
  if (days >= 60) { const months = Math.floor(days / 30); const rest = days - months * 30; return `${months} months${rest ? `, ${rest} ${rest === 1 ? 'day' : 'days'}` : ''} left`; }
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left`;
  const hours = Math.floor(ms / 3600000);
  return hours >= 1 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} left` : 'Ends within the hour';
}
// How much of the giveaway period has passed, 0..100, for the progress bar.
export function elapsedPercent(giveaway, now = Date.now()) {
  const start = new Date(giveaway.starts_at).getTime(), end = new Date(giveaway.ends_at).getTime();
  if (!(end > start)) return 0;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}
// "You have 3 tickets: 1 for entering, 2 for listings." for the member's own panel.
export function ticketLine(me) {
  if (!me || !me.entered) return '';
  if (!me.ready) return 'Your entry is saved. Finish payout setup with Stripe and it starts counting.';
  const parts = [];
  if (me.signup) parts.push(`${me.signup} for entering`);
  if (me.listings) parts.push(`${me.listings} for ${me.listings === 1 ? 'a listing' : 'listings'}`);
  if (me.referrals) parts.push(`${me.referrals} for ${me.referrals === 1 ? 'a referral' : 'referrals'}`);
  return `You have ${me.tickets} ${me.tickets === 1 ? 'ticket' : 'tickets'}${parts.length ? ': ' + parts.join(', ') : ''}.`;
}
export const GIVEAWAY_REQUIREMENT = 'Free to enter. Requires a verified Credabilia seller account, set up through Stripe. No purchase necessary.';

// Where the giveaway is open: the 50 states and DC, minus these. The same default is in the database (giveaways.excluded_states) and a test keeps the two in step.
// NY, FL and RI are the states with promotion-registration rules; the giveaway also refuses any prize worth $5,000 or more, so they are belt and braces.
export const GIVEAWAY_EXCLUDED_STATES = ['NY', 'FL', 'RI'];
export const US_STATES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];
export const eligibleStates = (excluded = GIVEAWAY_EXCLUDED_STATES) => US_STATES.filter(([code]) => !excluded.includes(code));
const stateNames = codes => codes.map(code => US_STATES.find(([c]) => c === code)?.[1] || code);
const joinNames = names => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
// "Open to residents of the 50 US states and DC, except Florida, New York and Rhode Island."
export const statesNote = (excluded = GIVEAWAY_EXCLUDED_STATES) => `Open to residents of the 50 US states and DC, except ${joinNames(stateNames([...excluded]).sort())}.`;
export const MAILIN_EMAIL = 'support@credabilia.com';
