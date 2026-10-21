import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css = await readFile(new URL('../src/giveaway.css', import.meta.url), 'utf8');
const rule = selector => css.split('\n').find(line => line.startsWith(selector + ' {')) || '';

test('the pinned giveaway card is centered on desktop and wider than before, and phones still get the full width', () => {
  const card = rule('.giveaway-card');
  assert.match(card, /margin: 0 auto 22px/, 'auto side margins center it in the Discover column');
  assert.match(card, /width: 100%/, 'it still shrinks to fit narrower columns');
  const max = Number(card.match(/max-width: (\d+)px/)?.[1]);
  assert.ok(max >= 700 && max <= 900, 'wide enough to fill the space, not stretched edge to edge (was 460): ' + max);
  assert.doesNotMatch(card, /margin-(left|right)/, 'nothing pushes it to one side');
  assert.match(css, /@media \(max-width: 600px\) \{ \.giveaway-card \{ max-width: none; \}/, 'on a phone the cap is removed');
});
