import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeBack } from '../src/nativeBack.js';

function fakeDialog({ handlesCancel }) {
  const calls = [];
  return {
    calls,
    dispatchEvent(event) { calls.push('cancel'); if (handlesCancel) event.preventDefault(); return true; },
    close() { calls.push('close'); },
  };
}
const docWith = dialogs => ({ querySelectorAll: selector => { assert.equal(selector, 'dialog[open]'); return dialogs; } });

test('Back closes the top-most open dialog and does nothing else', () => {
  const lower = fakeDialog({ handlesCancel: true }), top = fakeDialog({ handlesCancel: true });
  const history = { back() { throw new Error('should not go back'); } };
  assert.equal(handleNativeBack({ canGoBack: true }, { doc: docWith([lower, top]), history, exitApp: () => { throw new Error('should not exit'); } }), 'closed-dialog');
  assert.deepEqual(top.calls, ['cancel']);
  assert.deepEqual(lower.calls, []);
});

test('a dialog without a cancel handler is closed directly', () => {
  const dialog = fakeDialog({ handlesCancel: false });
  assert.equal(handleNativeBack({ canGoBack: false }, { doc: docWith([dialog]), history: {}, exitApp: () => { throw new Error('no exit'); } }), 'closed-dialog');
  assert.deepEqual(dialog.calls, ['cancel', 'close']);
});

test('with nothing open, Back steps through the page history', () => {
  let went = 0;
  assert.equal(handleNativeBack({ canGoBack: true }, { doc: docWith([]), history: { back: () => { went += 1; } }, exitApp: () => { throw new Error('no exit'); } }), 'back');
  assert.equal(went, 1);
});

test('on the first page with nothing open, Back leaves the app', () => {
  let exited = 0;
  assert.equal(handleNativeBack({ canGoBack: false }, { doc: docWith([]), history: { back: () => { throw new Error('no back'); } }, exitApp: () => { exited += 1; } }), 'exit');
  assert.equal(exited, 1);
});
