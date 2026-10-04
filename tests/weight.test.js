import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWeight, formatLength } from '../src/weight.js';

test('formatLength shows feet and inches once the size reaches a foot, and nothing before', () => {
  assert.equal(formatLength(''), '');
  assert.equal(formatLength('abc'), '');
  assert.equal(formatLength(0), '');
  assert.equal(formatLength(11.9), '');
  assert.equal(formatLength(12), '1 ft');
  assert.equal(formatLength('30'), '2 ft 6 in');
  assert.equal(formatLength(48), '4 ft');
  assert.equal(formatLength(40.5), '3 ft 4.5 in');
  assert.equal(formatLength(23.96), '2 ft', 'rounds to a tenth of an inch and carries into the next foot');
});

test('formatWeight shows pounds and ounces once the weight reaches a pound, and nothing before', () => {
  assert.equal(formatWeight(''), '');
  assert.equal(formatWeight('abc'), '');
  assert.equal(formatWeight(0), '');
  assert.equal(formatWeight(12), '');
  assert.equal(formatWeight(15.9), '');
  assert.equal(formatWeight(16), '1 lb');
  assert.equal(formatWeight('20'), '1 lb 4 oz');
  assert.equal(formatWeight(90), '5 lb 10 oz');
  assert.equal(formatWeight(32), '2 lb');
  assert.equal(formatWeight(24.5), '1 lb 8.5 oz');
  assert.equal(formatWeight(31.96), '2 lb', 'rounds to a tenth of an ounce and carries into the next pound');
});
