import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('the marketplace draws 48 cards at a time and "Show more" reveals the next batch without reloading', () => {
  assert.match(app, /const CARDS_PER_VIEW = 48;/);
  assert.ok(app.includes('collectionItems.slice(0, cardsShown).map('), 'only the first batch is drawn');
  assert.ok(app.includes('setCardsShown(n => n + CARDS_PER_VIEW)'), 'the button adds a batch locally');
  assert.ok(app.includes('collectionItems.length > cardsShown'), 'the button only shows when there is more');
});

test('search and filters still run over everything that is loaded, before the cards are cut to a batch, and a new view starts over', () => {
  const cut = app.indexOf('collectionItems.slice(0, cardsShown)');
  assert.ok(app.indexOf('const filtered = eligible.filter(') < app.indexOf('const collectionItems =') && app.indexOf('const collectionItems =') < cut, 'filter, then order, then cut');
  assert.ok(app.includes('}, [category, query, workspace, collectionFilter]);'), 'filters reset the batch');
});

test('the Sell workspace hero shows King Credion photographing a jersey, with light web versions of the picture', () => {
  assert.ok(app.includes("seller: { src: '/brand/king-credion-seller-photo-to-listing-v1.webp'"), 'the seller hero picture');
  assert.ok(app.includes('king-credion-seller-photo-to-listing-v1-560.webp 560w'), 'a smaller version for phones');
});
