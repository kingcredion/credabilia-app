import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATEGORIES} from '../src/domain.js';
import {categoryFromPath, categoryFromSlug, categoryPageTitle, categoryPath, categorySlug, pathForBrowse} from '../src/seoRoutes.js';

test('every real category has its own address, and only real categories do', () => {
  assert.deepEqual(CATEGORIES.map(categoryPath), ['/category/sports', '/category/comics', '/category/art', '/category/entertainment', '/category/history']);
  for (const name of CATEGORIES) { assert.equal(categoryFromSlug(categorySlug(name)), name); assert.equal(categoryFromPath(categoryPath(name)), name); }
  assert.equal(categoryFromPath('/category/Sports'), 'Sports', 'upper case still finds it');
  for (const bad of ['/category/football', '/category', '/category/sports/extra', '/sports', '/', '/item/123', '', null]) assert.equal(categoryFromPath(bad), null, String(bad));
});

test('the browse address follows the chosen category, and "All items" is the home page', () => {
  assert.equal(pathForBrowse('Sports'), '/category/sports');
  assert.equal(pathForBrowse('All items'), '/');
  assert.equal(categoryPageTitle('Art'), 'Art Memorabilia and Collectibles | Credabilia');
});

test('the app opens on the category in the address, keeps the address in step, supports back and forward, and sets the tab title', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("useState(() => categoryFromPath(window.location.pathname) || 'All items')"));
  assert.ok(app.includes('const target = selectedId ? `/item/${selectedId}` : pathForBrowse(category);'));
  assert.ok(app.includes("setCategory(categoryFromPath(window.location.pathname) || 'All items')"), 'back and forward restore the view');
  assert.ok(app.includes('categoryPageTitle(category)'));
});

test('the crawler layer and the app share one definition of category addresses, and the name cannot be a store name', () => {
  const middleware = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
  assert.ok(middleware.includes("from './src/seoRoutes.js'") && !middleware.includes("String(name).toLowerCase()"), 'one source of truth');
  assert.ok(middleware.includes("matcher: ['/', '/item/:id', '/category/:slug'"));
  assert.ok(middleware.includes("'giveaway-rules', 'category'"), 'reserved so a store cannot shadow it');
  const migration = readFileSync(new URL('../supabase/migrations/202610150149_seo_engine.sql', import.meta.url), 'utf8');
  assert.match(migration, /'giveaway-rules','category'\]/);
});
