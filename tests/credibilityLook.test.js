import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {credibilityTier} from '../src/credibility.js';

const source = readFileSync(new URL('../src/CredibilityDetails.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the tier words describe how much evidence there is, and never say an item is real or fake', () => {
  assert.deepEqual([0, 28, 39, 40, 63, 69, 70, 91, 100].map(credibilityTier), ['Limited', 'Limited', 'Limited', 'Fair', 'Fair', 'Fair', 'Strong', 'Strong', 'Strong']);
  assert.ok(source.includes('evidence'), 'the wording is about evidence');
  assert.doesNotMatch(source, /authentic(ated)? item|fake|genuine/i, 'no claim of authenticity');
});

test('marketplace cards use a half gauge and the item page uses five crowns, both with an accessible label', () => {
  assert.ok(source.includes('if (compact) return <span className={`credibility-gauge'), 'the compact meter is the half gauge');
  assert.ok(source.includes('[1, 2, 3, 4, 5].map(i => <Crown'), 'the full meter is five crowns');
  assert.ok(source.includes('aria-label={label}') && source.includes('Credibility score ${pct} out of 100'), 'screen readers get the score');
  assert.match(css, /\.credibility-gauge\.low \.gauge-fill\{stroke:#c1443a\}/);
  assert.match(css, /\.crown-on\{color:var\(--brand-gold\);fill:var\(--brand-gold\)\}/);
  assert.doesNotMatch(css, /credibility-meter-track/, 'the old bar styles are gone');
});
