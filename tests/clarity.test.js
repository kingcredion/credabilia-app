import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartClarity, CLARITY_PROJECT_ID } from '../src/clarity.js';

test('Clarity starts only on the real sites, and not for visitors in European time zones', () => {
  assert.equal(CLARITY_PROJECT_ID, 'ysofrrayq2');
  for (const host of ['credabilia.com', 'www.credabilia.com', 'credabilia.app', 'www.credabilia.app'])
    assert.equal(shouldStartClarity(host, 'America/Los_Angeles'), true, host);
  for (const host of ['localhost', '127.0.0.1', 'credabilia-next.vercel.app', 'evil-credabilia.com', 'credabilia.com.evil.test', ''])
    assert.equal(shouldStartClarity(host, 'America/Los_Angeles'), false, host);
  for (const zone of ['Europe/London', 'Europe/Paris', 'Atlantic/Reykjavik', 'Atlantic/Canary', 'Africa/Ceuta'])
    assert.equal(shouldStartClarity('credabilia.com', zone), false, zone);
  for (const zone of ['America/New_York', 'Asia/Tokyo', 'Atlantic/Bermuda', 'Africa/Lagos', '', undefined])
    assert.equal(shouldStartClarity('credabilia.com', zone), true, String(zone));
});
