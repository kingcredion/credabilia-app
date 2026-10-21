import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ISSUERS, resolveIssuer} from '../src/certificates.js';

const CHECKABLE = ['psa', 'jsa', 'bas', 'sgc', 'cgc', 'uda', 'fanatics', 'steiner', 'tristar', 'mlb'];

test('every issuer whose numbers can be looked up has an official lookup link and a plain explanation, and the ratings are unchanged', () => {
  const ratings = {psa: 95, jsa: 92, bas: 93, sgc: 90, cgc: 91, uda: 88, fanatics: 87, steiner: 85, tristar: 84, mlb: 89};
  for (const id of CHECKABLE) {
    const issuer = resolveIssuer(id);
    assert.equal(issuer.rating, ratings[id], id + ' rating');
    assert.match(issuer.lookup, /^https:\/\//, id + ' has an official lookup link');
    assert.match(issuer.website, /^https:\/\//, id + ' has a website');
    const {profile} = issuer;
    assert.ok(profile.summary.length > 60 && profile.looked.length >= 3 && profile.couldnt.length >= 2, id + ' explanation is complete');
    assert.ok(profile.why.includes(issuer.rating + ' out of 100'), id + ' explanation states its own rating');
    assert.ok(profile.why.includes('75%'), id + ' explanation says a seller-entered number counts at 75% until checked');
  }
});

test('every explanation states the rating it explains, and marks what is the company\'s own claim', () => {
  for (const issuer of ISSUERS.filter(i => i.profile)) {
    assert.ok(issuer.profile.why.includes(issuer.rating + ' out of 100'), issuer.id + ': the explanation matches the rating');
    const text = issuer.profile.looked.join(' ');
    if (/guarantee|witness/i.test(text)) assert.match(text, /own (statements?|guarantee)/i, issuer.id + ': a guarantee or process claim is marked as the company\'s own');
    assert.doesNotMatch(JSON.stringify(issuer.profile), /\b(scam|fraudster|arrest)\b/i, issuer.id + ': no allegation is repeated');
  }
});

test('the official pages that were confirmed are the ones linked', () => {
  assert.equal(resolveIssuer('sgc').lookup, 'https://www.gosgc.com/cert-code-lookup');
  assert.equal(resolveIssuer('uda').lookup, 'https://upperdeck.com/hologram/');
  assert.equal(resolveIssuer('fanatics').lookup, 'https://www.fanatics.com/fansecure');
  assert.equal(resolveIssuer('steiner').lookup, 'https://www.steinersports.com/authenticity');
  assert.equal(resolveIssuer('mlb').lookup, 'https://www.mlb.com/official-information/authentication');
  assert.equal(resolveIssuer('jsa').lookup, 'https://www.spenceloa.com/verify-authenticity');
  assert.equal(resolveIssuer('tristar').lookup, 'https://www.tristarauthentic.com/');
  assert.equal(resolveIssuer('psa').lookup, 'https://www.psacard.com/cert');
  assert.equal(resolveIssuer('bas').lookup, 'https://bas.beckett.com/verify-certificate');
  assert.equal(resolveIssuer('cgc').lookup, 'https://www.cgcgrading.com/verify');
});

test('the profile block shows only the links an issuer actually has', async () => {
  const cred = await readFile(new URL('../src/CredibilityDetails.jsx', import.meta.url), 'utf8');
  assert.ok(cred.includes('issuer.website && <a') && cred.includes('issuer.authenticityPage && <a'), 'each link is optional');
});

test('the shared-ownership facts are stated carefully: announced plans are not presented as completed deals', () => {
  assert.match(resolveIssuer('psa').profile.summary, /announced it would also acquire Beckett/);
  assert.match(resolveIssuer('bas').profile.summary, /announced it would acquire Beckett/);
  assert.match(resolveIssuer('jsa').profile.summary, /March 2024/);
});

test("CGC's explanation tells buyers that witnessed and unwitnessed signatures carry different guarantees", () => {
  const text = JSON.stringify(resolveIssuer('cgc').profile);
  assert.match(text, /yellow Signature Series label/); assert.match(text, /unwitnessed signature is not guaranteed/);
});
