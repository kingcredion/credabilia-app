import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = name => readFileSync(new URL(`../docs/auth-email-templates/${name}.html`, import.meta.url), 'utf8');

test('the sign-in emails carry the 8-digit code the apps need, plus the one-tap link', () => {
  for (const name of ['magic-link', 'confirm-signup']) {
    const html = load(name);
    assert.match(html, /\{\{ \.Token \}\}/, `${name} must show the code`);
    assert.match(html, /\{\{ \.ConfirmationURL \}\}/, `${name} must keep the link`);
    assert.match(html, /credabilia-logo-crown-email\.png/, `${name} must be Credabilia-branded`);
  }
});

test('the email-change message names both addresses and links to confirm', () => {
  const html = load('change-email');
  for (const variable of ['{{ .Email }}', '{{ .NewEmail }}', '{{ .ConfirmationURL }}']) assert.ok(html.includes(variable), `missing ${variable}`);
});

test('nothing a member sees mentions the default sender', () => {
  for (const name of ['magic-link', 'confirm-signup', 'change-email']) assert.doesNotMatch(load(name).replace(/<!--[\s\S]*?-->/g, ''), /supabase/i, name);
});
