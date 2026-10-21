import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Right after Google sign-in the profile is still loading. A tap on "Create a listing" in that moment used to report a missing selling permission
// (a Clarity recording of an ad visitor showed the tap doing nothing). It now waits for the profile and then opens the form.
test('Create a listing waits for the profile instead of reporting a missing permission', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("[createWhenReady, setCreateWhenReady] = useState(null)"));
  assert.ok(app.includes("else if (!profile) { setNotice('Getting your account ready…'); setCreateWhenReady(which); }"), 'with no profile yet, the tap is remembered');
  assert.ok(app.includes('function openCreate() { openSellForm(\'create\'); }') && app.includes("function openBulkCreate() { openSellForm('bulk-create'); }"), 'both forms share the same path');
  assert.ok(app.includes('if (createWhenReady && profile) {') && app.includes('if (profile.can_sell) setModal(which)'), 'once the profile arrives the form opens (only for members who can sell)');
  assert.ok(app.includes('if (createWhenReady && !session) setCreateWhenReady(null)'), 'signing out forgets the waiting tap');
});
