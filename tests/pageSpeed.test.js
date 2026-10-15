import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// Clarity measured slow first loads (largest paint 3.6s) on the seller landing page and page jumps from late-arriving fonts. These guard the fixes.
test('the seller landing page loads without the marketplace code', () => {
  const main = read('../src/main.jsx');
  assert.ok(!/import App from/.test(main), 'App is no longer a static import of the entry');
  assert.ok(main.includes("import('./SellPage.jsx')") && main.includes("import('./App.jsx')"));
  assert.ok(main.includes("(isSellHost(window.location.hostname) && window.location.pathname === '/') || window.location.pathname === '/sell'"), 'same routes the app treats as the sell page');
  const app = read('../src/App.jsx');
  assert.ok(app.includes("(isSellHost(window.location.hostname) && window.location.pathname === '/')"), 'App still renders the sell page for the same routes');
});

test('every other page still starts fetching the app code up front, and the landing page does not', () => {
  const config = read('../vite.config.js');
  assert.ok(config.includes('preloadAppChunk()') && config.includes("rel=\"modulepreload\""));
  assert.ok(config.includes('p==="/sell")return;'), 'skipped on the seller landing page');
});

test('the hero photo is requested early and fonts are linked from the page head, not a CSS @import', () => {
  const html = read('../index.html');
  assert.ok(html.includes("'/brand/sell-hero-mobile.webp'") && html.includes("'/brand/sell-hero-desktop.webp'") && html.includes("l.rel = 'preload'"));
  assert.ok(html.includes('rel="preconnect" href="https://fonts.googleapis.com"') && html.includes('rel="preconnect" href="https://fonts.gstatic.com" crossorigin') && html.includes('fonts.googleapis.com/css2?family=DM+Sans'));
  assert.ok(!/@import url\(/.test(read('../src/styles.css')), 'no render-blocking font @import');
});

test('the home hero offers a smaller photo to phones', () => {
  const app = read('../src/App.jsx');
  assert.ok(app.includes("mobile-launch-hero-v3-560.webp 560w, /brand/mobile-launch-hero-v3.webp 960w") && app.includes('sizes="(max-width: 720px) 360px, 460px"'));
});
