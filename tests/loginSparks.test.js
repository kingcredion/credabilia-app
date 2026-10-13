import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

// The sign-in box's gold sparks are decoration only: people who ask their device for reduced motion get none of the movement.
test('login sparks: hidden for reduced motion, never announced to screen readers, and only transform/opacity move', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.login-sparks\{display:none\}/);
  assert.ok(app.includes('<div className="login-sparks" aria-hidden="true">'));
  const keyframes = css.match(/@keyframes login-spark\{.*?\}\}\n/s)?.[0] || '';
  assert.ok(keyframes.includes('transform') && keyframes.includes('opacity'));
  assert.ok(!/(top|left|bottom|width|height)\s*:/.test(keyframes), 'sparks must not animate layout properties');
});
