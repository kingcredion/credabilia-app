import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the publish button never fails silently: it says what it is waiting for, and a refused click shows and highlights what is missing', () => {
  assert.ok(app.includes("const waitingReason=busy?''"), 'a reason is worked out while the button is off');
  assert.ok(app.includes('className="field-note publish-wait"'), 'and shown next to the button');
  assert.ok(app.includes('onInvalidCapture='), 'a click blocked by a missing field is noticed');
  assert.ok(app.includes("Some details are missing. Fill in the highlighted fields"), 'and says so in words');
  assert.match(css, /\.tried :is\(input,select,textarea\):invalid\{border-color:var\(--error-text\)/, 'the missing fields are highlighted');
});

test('a form error scrolls into view and the cursor goes to the field it is about', () => {
  assert.ok(app.includes('errorRef.current?.scrollIntoView'), 'the error is brought on screen');
  assert.ok(app.includes('ref={errorRef}'));
  for (const prefix of ['Choose the issuer', 'Confirm the certificate details', 'Confirm the statement', 'Enter who signed it']) assert.ok(app.includes(`'${prefix}'`), prefix);
  assert.ok(app.includes('pointAtField(err.message)'), 'the failing field is focused');
  assert.ok(app.includes('id="attest-check"') && app.includes('id="cert-confirm-check"'));
});
