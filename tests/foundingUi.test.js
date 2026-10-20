import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {FOUNDING_BADGE, FOUNDING_FEE_NOTE, FOUNDING_TERMS, showFoundingBadge, claimView} from '../src/founding.js';

const sharp = createRequire(import.meta.url)('sharp');
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const squash = text => text.replace(/\r\n/g, '\n');

test('the badge is shown only to a signed-in member the server says holds a spot, and everyone else keeps the existing badge', () => {
  const session = {user: {id: 'u1'}};
  assert.equal(showFoundingBadge(session, {member: true, spot_number: 7}), true);
  assert.equal(showFoundingBadge(session, {member: false, invited: true, open: true}), false, 'invited is not qualified');
  assert.equal(showFoundingBadge(session, null), false, 'status not loaded yet');
  assert.equal(showFoundingBadge(null, {member: true}), false, 'signed out');
  assert.equal(showFoundingBadge(undefined, {member: true}), false);
  assert.equal(showFoundingBadge(session, {member: 'yes'}), false, 'only a real true counts');
});

test('the claim page shows the right message for each situation', () => {
  assert.equal(claimView(null), 'loading');
  assert.equal(claimView({member: true, open: false}), 'member', 'a member sees their status even after the window closes');
  assert.equal(claimView({member: false, open: true, invited: true}), 'invited');
  assert.equal(claimView({member: false, open: true, invited: false}), 'not-invited');
  assert.equal(claimView({member: false, open: false, invited: false}), 'closed');
  assert.equal(claimView({member: false, open: false, invited: true}), 'closed', 'a closed campaign is closed even for an invited email');
});

test('the text under the badge is exactly the approved wording', () => {
  assert.equal(FOUNDING_FEE_NOTE, 'Your Credabilia selling fees are waived for the lifetime of the platform. Payment-processing fees still apply.');
});

test('the badge artwork keeps its proportions and transparency in both web sizes, and the original is untouched', async () => {
  const original = await sharp(new URL('../public/brand/founding-100-badge-v2.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).metadata();
  assert.equal(original.hasAlpha, true);
  const ratio = original.width / original.height;
  for (const [file, width] of [['founding-100-badge-v2.webp', 920], ['founding-100-badge-v2-460.webp', 460]]) {
    const meta = await sharp(new URL('../public/brand/' + file, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).metadata();
    assert.equal(meta.width, width, file);
    assert.ok(Math.abs(meta.width / meta.height - ratio) < 0.01, file + ' keeps the original proportions');
    assert.equal(meta.hasAlpha, true, file + ' keeps its transparent background');
  }
  assert.equal(FOUNDING_BADGE.width / FOUNDING_BADGE.height > 2.9 && FOUNDING_BADGE.width / FOUNDING_BADGE.height < 3.1, true, 'the width and height given to the page match the artwork');
  assert.match(FOUNDING_BADGE.srcSet, /460w.*920w/);
});

test('the hero swaps the badge for a qualified member only, and keeps the old badge file for everyone else', async () => {
  const app = squash(await read('src/App.jsx'));
  assert.match(app, /showFoundingBadge\(session, founding\) \? <FoundingHeroBadge\/> : <img className="ai-marketplace-badge" src="\/brand\/ai-powered-marketplace-badge-v3\.webp"/);
  assert.match(app, /service\.foundingStatus\(\)\.then\(value => \{ if \(alive\) setFounding\(value\); \}\)/, 'status comes from the server');
});

test('the badge and the founding status can never control a fee: no money code reads them', async () => {
  const service = squash(await read('src/service.js')), demo = squash(await read('src/demo.js'));
  for (const [name, source] of [['service.js', service], ['demo.js', demo]]) {
    const outside = source.split('\n').filter(line => !/^\s*\/\//.test(line) && /founding/i.test(line) &&!/async (founding|claimFounding|adminFounding|adminStartFounding)/.test(line) && !/Founding 100/.test(line) && !/founding-preview/.test(line) && !/seller_founding: true/.test(line));
    assert.deepEqual(outside, [], name + ': nothing but the Founding methods mentions the program');
  }
  assert.doesNotMatch(service.split("async startCheckout")[1]?.split('\n    async ')[0] || '', /founding/i, 'checkout never looks at founding status');
  const app = squash(await read('src/App.jsx'));
  // The variable itself (not the word inside a quoted name, route or label): only the status loader and the badge choice may mention it.
  const uses = app.split('\n').filter(line => /(?<![\w'"\/.-])founding(?![\w'"-])/.test(line) && !/setFounding|\[founding,|showFoundingBadge\(session, founding\)/.test(line));
  assert.deepEqual(uses, [], 'the status is only used to choose the badge');
});

test('/founding is a real page, kept out of search, not claimable as a store name, and explained in the Terms', async () => {
  const app = squash(await read('src/App.jsx')), legal = squash(await read('src/Legal.jsx')), robots = await read('public/robots.txt');
  assert.match(app, /window\.location\.pathname === '\/founding' \? 'founding'/);
  assert.match(app, /if \(legalPage === 'founding'\) return <FoundingPage service=\{service\} EmailLogin=\{EmailLogin\}\/>;/);
  assert.match(robots, /^Disallow: \/founding$/m);
  assert.match(legal, /name = 'robots'; meta\.content = 'noindex, nofollow'/);
  assert.match(legal, /<strong>Founding 100 program\.<\/strong> \{FOUNDING_TERMS\.join\(' '\)\}/);
  assert.equal(FOUNDING_TERMS.length, 3);
  const terms = FOUNDING_TERMS.join(' ');
  assert.match(terms, /Payment-processing|payment-processing/, 'the terms say processing is separate');
  assert.match(terms, /good standing/);
  assert.match(terms, /cannot be transferred or sold/);
  assert.match(terms, /Unclaimed invitations, and the contact details kept for them, are deleted when the window closes/);
});

test('the admin dashboard has a Founding 100 tab backed by operator-only calls', async () => {
  const app = squash(await read('src/App.jsx')), admin = await read('src/AdminFounding.jsx'), service = squash(await read('src/service.js'));
  assert.match(app, /setTab\('founding'\)\}>Founding 100<\/button>/);
  assert.match(app, /tab === 'founding' && <AdminFounding service=\{service\}\/>/);
  assert.match(admin, /adminFoundingOverview\(\)/);
  for (const rpc of ['admin_founding_overview', 'admin_founding_invitations', 'admin_start_founding_campaign', 'founding_status', 'claim_founding_spot']) assert.match(service, new RegExp(`rpc\\('${rpc}'`), rpc);
});

test('the invitation list is not in any public or committed file', async () => {
  const {execFileSync} = await import('node:child_process');
  const tracked = execFileSync('git', ['ls-files'], {cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')}).toString().split('\n');
  for (const file of tracked) assert.doesNotMatch(file, /invitation|founding.*(list|csv|import)|seller-call-list/i, 'not tracked: ' + file);
  const sql = squash(await read('supabase/migrations/202610200159_founding_100.sql'));
  assert.doesNotMatch(sql, /@(gmail|yahoo|hotmail|outlook|aol)\./i, 'the migration holds no contact addresses');
});

test('the claim page tells people to use the email we contacted, and explains Apple "Hide My Email" when that is what they signed in with', async () => {
  const {isAppleRelayEmail, SAME_EMAIL_NOTE} = await import('../src/founding.js');
  assert.equal(isAppleRelayEmail('x7k2abc@privaterelay.appleid.com'), true);
  assert.equal(isAppleRelayEmail('  X7K@PrivateRelay.AppleID.com '), true);
  assert.equal(isAppleRelayEmail('owner@icloud.com'), false, 'a real iCloud address is fine');
  assert.equal(isAppleRelayEmail('owner@gmail.com'), false);
  assert.equal(isAppleRelayEmail(null), false);
  assert.match(SAME_EMAIL_NOTE, /exact email address we contacted/);
  assert.match(SAME_EMAIL_NOTE, /Hide My Email/);
  const legal = squash(await read('src/Legal.jsx'));
  assert.match(legal, /<strong>\{SAME_EMAIL_NOTE\}<\/strong>/, 'shown before they sign in');
  assert.match(legal, /isAppleRelayEmail\(session\?\.user\?\.email\) && <p>That is an Apple/, 'and explained after a mismatch');
});

test('inside the phone apps the claim page sends a non-member to the web browser, and the admin view shows how founders sign in', async () => {
  const legal = squash(await read('src/Legal.jsx')), admin = await read('src/AdminFounding.jsx');
  assert.match(legal, /import \{ isNativeApp \} from '\.\/nativeAuth\.js';/);
  assert.match(legal, /const webOnly = isNativeApp\(\) && \(view === 'signed-out' \|\| view === 'invited' \|\| view === 'not-invited' \|\| view === 'closed'\);/, 'a member still sees their status in the app');
  for (const v of ['signed-out', 'invited', 'not-invited', 'closed']) assert.match(legal, new RegExp(`\{!webOnly && view === '${v}'`), v + ' is hidden in the app');
  assert.match(legal, /Please open <strong>credabilia\.com\/founding<\/strong> in your phone's web browser/);
  assert.doesNotMatch(legal.split('webOnly &&')[1]?.split('</div>')[0] || '', /EmailLogin/, 'no sign-in box inside the app notice');
  assert.match(admin, /<th>Account email<\/th><th>Signs in with<\/th>/);
  assert.match(admin, /m\.apple_hidden_email && /);
});

test('the Founding chip, the sales fee line and the one-time welcome are wired in, and the welcome is remembered per account', async () => {
  const app = squash(await read('src/App.jsx')), store = squash(await read('src/Storefront.jsx')), badge = squash(await read('src/FoundingBadge.jsx'));
  assert.match(app, /item\.seller_name\}\{item\.seller_founding && <FoundingChip\/>\}/, 'on marketplace cards');
  assert.match(app, /Shared by \{selected\.seller_name\}\{selected\.seller_founding && <FoundingChip\/>\}/, 'on the item page');
  assert.match(store, /\{store\.founding && <p className="founding-store-chip"><FoundingChip\/><\/p>\}/, 'on the storefront');
  assert.match(app, /\{sale\.selling_fee_waived && <p className="field-note founding-fee-note">Founding 100: Credabilia selling fee waived \(you saved \{money\(sale\.waived_selling_fee_cents\)\}\)\. Payment processing: −\{money\(sale\.processing_fee_cents\)\}\.<\/p>\}/, 'on the seller\'s own sales');
  assert.match(app, /showFoundingBadge\(session, founding\) && <FoundingWelcome userId=\{session\.user\.id\}\/>/, 'the welcome is only for a qualified, signed-in member');
  assert.match(badge, /'credabilia:founding-welcome-seen:' \+ userId/, 'remembered per account');
  assert.match(badge, /catch \{ return false; \}/, 'and never shown over and over when the browser cannot remember');
  assert.match(badge, /Payment-processing fees still apply/, 'the welcome repeats that processing is separate');
});
