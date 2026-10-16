import { CATEGORIES } from './domain.js';

// Category pages live at /category/<name> (sports, comics, art, entertainment, history): real, shareable addresses for the marketplace's real categories.
// The app and the crawler layer (middleware.js) both use these, so a visitor and a search engine always agree on what an address means.
export const categorySlug = name => String(name).toLowerCase();
export const categoryFromSlug = slug => CATEGORIES.find(c => categorySlug(c) === String(slug).toLowerCase()) || null;
export const categoryPath = name => '/category/' + categorySlug(name);

// '/category/sports' -> 'Sports'; anything else -> null.
export function categoryFromPath(pathname) {
  const segments = String(pathname || '').split('/').filter(Boolean);
  return segments.length === 2 && segments[0] === 'category' ? categoryFromSlug(segments[1]) : null;
}

// The address that shows the current browse view: a category has its own, everything else is the home page.
export const pathForBrowse = category => (CATEGORIES.includes(category) ? categoryPath(category) : '/');
export const categoryPageTitle = category => `${category} Memorabilia and Collectibles | Credabilia`;
