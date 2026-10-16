import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.jsx'), first = read('../src/FirstListing.jsx'), button = read('../src/SaveButton.jsx'), css = read('../src/styles.css'), theme = read('../src/theme.css');

test('the shared save button goes from its label to "Saving…" to a green check and "Saved"', () => {
  assert.ok(button.includes("savingLabel = 'Saving…'") && button.includes("savedLabel = 'Saved'"));
  assert.ok(button.includes('<Check size={16}'), 'a check mark');
  assert.ok(button.includes('is-saved'), 'a saved class for the colour');
  assert.match(css, /\.save-button\.is-saved[^{]*\{background:var\(--saved\)/);
  assert.equal((theme.match(/--saved:#/g) || []).length, 3, 'defined for light, dark and automatic dark');
});

test('every save on the site uses it: listing edits, display name, store name, shipping address, text alerts and the first-listing store name', () => {
  for (const label of ['Save changes', 'Save name', 'Save address']) assert.match(app, new RegExp('<SaveButton[^>]*>' + label + '</SaveButton>'), label);
  assert.equal((app.match(/<SaveButton saving=\{(saving|busy)\} saved=\{saved\}>Save<\/SaveButton>/g) || []).length, 2, 'store name and text alerts');
  assert.ok(first.includes('<SaveButton type="submit"') && first.includes('saved={nameSaved}'));
  for (const old of ["'Saved!'", "'Save name'}</button>", "'Save changes'}</button>"]) assert.ok(!app.includes(old), 'old plain button gone: ' + old);
});

test('a save that closes its window shows the green "Saved" for a moment first, so the person sees it worked', () => {
  assert.match(button, /SAVED_HOLD_MS = 900/);
  assert.ok(app.includes('await showSavedThen(setSaved,onSaved)'), 'listing edit');
  assert.ok(app.includes('await showSavedThen(setSaved, onSaved)'), 'display name');
});

test('submitting an audit shows a green "Audit recorded" before the next item appears, and a rating shows it is saved', () => {
  assert.ok(app.includes('savedLabel="Audit recorded"'));
  assert.ok(app.includes('await showSavedThen(setRecorded, advance)'), 'the item stays visible for a moment');
  assert.ok(app.includes('Rating saved'));
});
