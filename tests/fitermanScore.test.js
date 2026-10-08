import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ISSUERS, LOOKUP_ISSUERS, certificateInput, resolveIssuer} from '../src/certificates.js';
import {credibilityScore} from '../src/credibility.js';

test('Credabilia is no longer an issuer, and Fiterman Sports is one that has no certificate numbers', () => {
  assert.equal(ISSUERS.some(issuer => issuer.id === 'credabilia'), false);
  assert.equal(resolveIssuer('Fiterman Sports').id, 'fiterman');
  assert.equal(resolveIssuer('fiterman').noNumber, true);
  assert.deepEqual(certificateInput({certificate_issuer: 'fiterman'}), {certificate_issuer: 'fiterman', certificate_number: null, certificate_company: null});
  // A number typed for an issuer that has none is dropped rather than stored.
  assert.equal(certificateInput({certificate_issuer: 'fiterman', certificate_number: '12345'}).certificate_number, null);
  assert.throws(() => certificateInput({certificate_issuer: 'psa'}), /certificate number/i);
});

test('the public lookup only offers issuers that have searchable numbers', () => {
  const ids = LOOKUP_ISSUERS.map(issuer => issuer.id);
  assert.ok(ids.includes('psa') && ids.includes('bas') && ids.includes('jsa'));
  assert.ok(!ids.includes('fiterman') && !ids.includes('other'));
});

test('a Fiterman certificate is scored lower than a numbered one but above having none, and needs no number', () => {
  const fiterman = credibilityScore({certificate_issuer: 'fiterman', certificate_number: null});
  const numbered = credibilityScore({certificate_issuer: 'psa', certificate_number: '00001234'});
  const none = credibilityScore({});
  assert.equal(fiterman.certificate_supplied, true);
  assert.equal(fiterman.certificate_score, 50);
  assert.ok(fiterman.credibility_score < numbered.credibility_score);
  assert.ok(fiterman.credibility_score > none.credibility_score);
});
