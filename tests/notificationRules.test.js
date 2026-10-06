import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLoud, pruneSeen, glowClass, notificationKey, notificationSignature, REPULSE_AFTER_MS, DEADLINE_WARNING_MS} from '../src/notifications.js';

const H = 3600 * 1000, now = Date.parse('2026-10-06T12:00:00Z');
const item = (extra = {}) => ({kind: 'ship_pending', purchase_id: 'p1', listing_id: 'l1', conversation_id: null, at: '2026-10-06T08:00:00Z', ...extra});
const seenAt = ms => ({[notificationKey(item())]: {seenAt: ms}});

test('an item pulses when new and calms once seen', () => {
  assert.equal(isLoud(item(), {}, now), true, 'never seen');
  assert.equal(isLoud(item(), seenAt(now - H), now), false, 'seen an hour ago');
});

test('a seen item pulses again after a day, or when something newer happens, or when its deadline is close', () => {
  assert.equal(isLoud(item(), seenAt(now - REPULSE_AFTER_MS - 1), now), true, 'a day later');
  assert.equal(isLoud(item({kind: 'message', at: '2026-10-06T11:30:00Z'}), {[notificationKey(item({kind: 'message'}))]: {seenAt: now - H}}, now), true, 'a newer message');
  const deadline = new Date(now + 6 * H).toISOString();
  assert.equal(isLoud(item({expires_at: deadline}), seenAt(now - 8 * H), now), true, 'deadline within 12h and last seen before the warning point');
  assert.equal(isLoud(item({expires_at: deadline}), seenAt(now - 2 * H), now), false, 'seen after the warning point');
  assert.equal(isLoud(item({expires_at: deadline}), seenAt(now - 1000), now), false, 'seen after the warning point');
  const far = new Date(now + 30 * H).toISOString();
  assert.equal(isLoud(item({expires_at: far}), seenAt(now - 2 * H), now), false, 'deadline still far off');
  const past = new Date(now - H).toISOString();
  assert.equal(isLoud(item({expires_at: past}), seenAt(now - 2 * H), now), false, 'an expired deadline does not re-pulse');
  assert.ok(DEADLINE_WARNING_MS === 12 * H);
});

test('finished items are forgotten, and the glow class has three states', () => {
  const seen = {[notificationKey(item())]: {seenAt: 1}, 'gone|||': {seenAt: 1}};
  assert.deepEqual(Object.keys(pruneSeen(seen, [item()])), [notificationKey(item())]);
  assert.equal(glowClass(true, true), ' attention-glow');
  assert.equal(glowClass(true, false), ' attention-calm');
  assert.equal(glowClass(false, false), '');
});

test('the signature changes when an item appears or finishes, not otherwise', () => {
  const a = notificationSignature([item()]);
  assert.equal(a, notificationSignature([item()]));
  assert.notEqual(a, notificationSignature([]));
  assert.notEqual(a, notificationSignature([item(), item({purchase_id: 'p2'})]));
});
