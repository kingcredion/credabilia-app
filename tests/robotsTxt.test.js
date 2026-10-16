import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');

test('robots.txt keeps the sign-in return page and server functions out of search, and leaves public pages, photos and the sitemap open', () => {
  assert.match(robots, /^Disallow: \/auth\/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/credabilia\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Disallow: \/(img|item|category|sell|certificate|help)?\s*$/m, 'no public path is blocked');
  assert.doesNotMatch(robots, /Disallow:.*\/img/, 'item photos stay crawlable');
});
