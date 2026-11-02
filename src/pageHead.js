// Keeps a visitor's browser head honest. Crawlers are given a per-page head by middleware.js, but the HTML a normal browser receives is the generic home-page shell, and the app
// only ever set the tab title. These helpers update the tags that already exist in that shell (never adding a second canonical or description), so the address, the canonical
// and the description always agree, whoever is looking. Structured data is deliberately NOT added here: crawlers already get it from middleware.js, and a second copy would duplicate it.
const ORIGIN = 'https://credabilia.com';

function tag(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) { el = create(); document.head.appendChild(el); }
  return el;
}

// The canonical for an address: tracking parameters, fragments and a trailing slash never make a second page (same rule as middleware.js).
export const canonicalFor = pathname => ORIGIN + (String(pathname || '/').replace(/\/+$/, '') || '/');

export function setCanonical(pathname = window.location.pathname) {
  const href = canonicalFor(pathname);
  tag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).setAttribute('href', href);
  document.head.querySelector('meta[property="og:url"]')?.setAttribute('content', href);
}

export function setDescription(text) {
  if (!text) return;
  tag('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' })).setAttribute('content', text);
  document.head.querySelector('meta[property="og:description"]')?.setAttribute('content', text);
}

// Title, description and canonical for the page being shown now.
export function setPageHead({ title, description, pathname } = {}) {
  if (title) {
    document.title = title;
    document.head.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  }
  setDescription(description);
  setCanonical(pathname);
}

// A page that does not exist (an unknown store, a retired address): keep it out of search. Returns a function that undoes it.
export function markNoIndex() {
  const el = tag('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }));
  const before = el.getAttribute('content');
  el.setAttribute('content', 'noindex, follow');
  return () => { if (before === null) el.remove(); else el.setAttribute('content', before); };
}
