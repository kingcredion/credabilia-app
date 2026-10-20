import { next } from '@vercel/functions';
import { CATEGORIES } from './src/domain.js';
import { ISSUERS } from './src/certificates.js';
import { DETAIL_FIELDS } from './src/listingDetails.js';
import { categoryFromSlug, categoryPath } from './src/seoRoutes.js';

// Search and link-preview layer. The app is a single page that draws itself with JavaScript, so a crawler that does not run it would see the same empty page for every
// address. For known crawler user agents (BOT_UA) this gives each public address its own title, description, canonical, social tags, structured data and a plain-HTML copy
// of the same content a visitor sees (plus links between items, sellers and categories). Real visitors are never routed through the extra lookups: they get the page
// straight away and the app sets the title itself. /sitemap.xml and /products.xml are served to everyone because they are machine-readable by definition.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SITE_ORIGIN = 'https://credabilia.com';
const DEFAULT_IMAGE = SITE_ORIGIN + '/brand/app-icons/crown-c/web/icon-512.png';
const RESERVED_SLUGS = new Set(['terms', 'privacy', 'help', 'auth', 'item', 'sell', 'certificate', 'giveaway-rules', 'category']);
// Includes Google's other fetchers (Search Console's live URL test is "Google-InspectionTool", which does not say "bot"), speed-test tools, and spiders that call themselves spider or crawler.
const BOT_UA = /bot|spider|crawl|google-|googleother|lighthouse|pagespeed|facebookexternalhit|facebookcatalog|twitterbot|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|applebot|pinterest|redditbot|vkshare|skypeuripreview|embedly|quora|outbrain|iframely|w3c_validator/i;
export const isCrawler = userAgent => BOT_UA.test(userAgent || '');
const SITEMAP_URL_LIMIT = 45000; // the protocol allows 50,000 per file; stay under it

export const config = {
  matcher: ['/', '/item/:id', '/category/:slug', '/:slug([^/.]+)', '/sitemap.xml', '/sitemaps/:file', '/products.xml'],
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(cents) {
  return typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '';
}
// Cut at a word boundary so a description never ends mid-word.
export function shorten(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s,.;:-]+$/, '') + '…';
}

// One address, one canonical: tracking and share parameters (utm_*, ref, fbclid, gclid, list, giveaway) and fragments never create a second page, and a trailing slash is dropped.
export function canonicalUrl(url) {
  const u = url instanceof URL ? url : new URL(url);
  const path = u.pathname.replace(/\/+$/, '') || '/';
  return SITE_ORIGIN + path;
}

// A short in-memory cache for the two list lookups, so a burst of crawler requests costs the database one query a minute instead of one per request.
const CACHE_TTL_MS = 60000;
const cache = new Map();
export function clearSeoCache() { cache.clear(); }
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await fn();
  if (value !== null && value !== undefined) cache.set(key, { at: Date.now(), value });
  return value;
}

// { ok, data }: ok is false when the call itself failed (so "no such page" can be told apart from "Supabase is having a moment").
async function callRpcChecked(name, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, data: null };
    return { ok: true, data: await res.json() };
  } catch { return { ok: false, data: null }; }
}
async function callRpc(name, body) {
  return (await callRpcChecked(name, body)).data;
}
const sitemapData = () => cached('sitemap_entries', () => callRpc('sitemap_entries', {}));
const listingIndex = (category = null, limit = 60, exclude = null) => cached(`index|${category}|${limit}|${exclude}`, () => callRpc('seo_listing_index', { p_category: category, p_limit: limit, p_exclude: exclude }));

// Returned by buildMeta when the lookup worked and there is simply no such item, storefront or category.
export const NOT_FOUND = Symbol('not found');

// RLS lets anon sign a path only when it belongs to an active listing's media (see read_listing_media's storage.objects policy), which is exactly the set of photos this
// middleware ever has reason to ask for -- see get_listing_preview()/get_storefront().
async function signedImageUrl(path, expiresIn = 604800) {
  if (!path) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/listing-media/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
  } catch { return null; }
}

const SITE_NAME = 'Credabilia';
const HOME_DESCRIPTION = 'Credabilia is The Memorabilia Kingdom: buy and sell collectibles, explore certificate details, and collect with confidence.';
const STATIC_PAGES = {
  help: { title: 'Help Center | Credabilia', description: 'Answers about buying, selling, shipping, payment protection, certificates and community audits on Credabilia.', heading: 'Credabilia Help Center', text: 'Answers about buying, selling, shipping, how your payment is held until delivery, certificates of authenticity and community audits.' },
  terms: { title: 'Terms of Service | Credabilia', description: 'The terms for buying and selling on Credabilia, including payment holds, refunds, shipping and certificates.', heading: 'Credabilia Terms of Service', text: 'The terms for buying and selling on Credabilia, including how payments are held until delivery, refunds, shipping and certificates.' },
  privacy: { title: 'Privacy Policy | Credabilia', description: 'How Credabilia collects, uses and protects your information.', heading: 'Credabilia Privacy Policy', text: 'How Credabilia collects, uses and protects your information.' },
  certificate: { title: 'Certificate lookup | Credabilia', description: 'Search a certificate number from PSA/DNA, JSA, Beckett (BAS) and other issuers to see whether it appears on a Credabilia listing.', heading: 'Certificate lookup', text: 'Search a certificate number from PSA/DNA, JSA, Beckett (BAS) and other issuers to see whether it appears on a Credabilia listing.' },
  'giveaway-rules': { title: 'Giveaway Official Rules | Credabilia', description: 'Official rules for the Credabilia giveaway: no purchase necessary, how to enter, how tickets and odds work, eligibility and how the winner is chosen.', heading: 'Credabilia Giveaway Official Rules', text: 'Official rules for the Credabilia giveaway. No purchase necessary. Includes how to enter, free email entry, how tickets and odds work, eligibility, the prize and how the winner is chosen.' },
  sell: { title: 'Sell your memorabilia | Credabilia', description: 'List signed memorabilia and collectibles on Credabilia. Get paid through Stripe after delivery, with item credibility scores that help buyers trust your listing.', heading: 'Sell your memorabilia on Credabilia', text: 'List signed memorabilia and collectibles. You are paid through Stripe after delivery, and item credibility scores help buyers trust your listing.' },
};

// Category pages use the marketplace's real categories (src/domain.js). Each has its own wording; nothing here claims anything about the items themselves.
const CATEGORY_INTRO = {
  Sports: 'Signed jerseys, balls, helmets, gloves, trading cards and other sports memorabilia, listed by collectors and sellers.',
  Comics: 'Comic books, graded issues, signed covers and related collectibles, listed by collectors and sellers.',
  Art: 'Original and signed artwork, prints and framed pieces, listed by collectors and sellers.',
  Entertainment: 'Movie, television and music memorabilia, props and signed pieces, listed by collectors and sellers.',
  History: 'Historical documents, artifacts and signed pieces, listed by collectors and sellers.',
};
export { categoryFromSlug };

const NAV_LINKS = '<nav><a href="/">Credabilia</a> · <a href="/help">Help</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/certificate">Certificate lookup</a> · <a href="/sell">Sell</a> · <a href="/giveaway-rules">Giveaway rules</a></nav>';
const CATEGORY_LINKS = '<nav aria-label="Categories">' + CATEGORIES.map(c => '<a href="' + categoryPath(c) + '">' + escapeHtml(c) + '</a>').join(' · ') + '</nav>';

const issuerName = item => {
  if (!item.certificate_issuer) return null;
  if (item.certificate_issuer === 'other') return item.certificate_company || null;
  return ISSUERS.find(i => i.id === item.certificate_issuer)?.name || null;
};

// What a listing's own fields say, in the order a buyer reads them: only fields the seller filled in, with the labels the listing form uses.
function detailPairs(item) {
  const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
  return Object.entries(DETAIL_FIELDS).filter(([key]) => typeof attrs[key] === 'string' && attrs[key].trim()).map(([key, label]) => [label, attrs[key].trim()]);
}

// Title, description and image text derived from real listing data. Nothing is invented: a missing field is simply left out, authentication is never claimed (a certificate is
// described as "listed" with its issuer), and the giveaway prize says plainly that it is not for sale.
export function listingSeo(item) {
  const attrs = item.attributes || {};
  const subject = typeof attrs.subject === 'string' ? attrs.subject.trim() : '';
  const base = subject && !item.title.toLowerCase().includes(subject.toLowerCase()) ? `${item.title} – ${subject}` : item.title;
  const title = `${shorten(base, 62)} | ${SITE_NAME}`;
  const cert = issuerName(item);
  let description;
  if (item.giveaway_prize) {
    description = shorten(`${item.title} is the prize in the Credabilia giveaway. Not for sale. See the official rules and how to enter free.`, 155);
  } else {
    const facts = [attrs.sport, attrs.team, attrs.year].filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).join(' · ');
    const parts = [`Explore ${item.title} on ${SITE_NAME}.`, money(item.price_cents) && `${item.listing_type === 'auction' ? 'Current price' : 'Price'} ${money(item.price_cents)}.`, facts && facts + '.', cert && item.certificate_has_number ? `${cert} certificate number listed.` : '', item.description];
    description = shorten(parts.filter(Boolean).join(' '), 155);
  }
  const alt = [item.title, subject && !item.title.toLowerCase().includes(subject.toLowerCase()) ? subject : '', item.category ? `${item.category} memorabilia` : ''].filter(Boolean).join(' – ');
  return { title, description, alt };
}

// schema.org Product for one listing, so Google can show price and availability. Only facts the listing already states publicly; a giveaway prize has no offer because it is not for sale.
export function productJsonLd(item, pageUrl, image) {
  const props = detailPairs(item).map(([name, value]) => ({ '@type': 'PropertyValue', name, value }));
  const offer = {
    '@type': 'Offer',
    url: pageUrl,
    priceCurrency: 'USD',
    price: (item.price_cents / 100).toFixed(2),
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/UsedCondition',
    seller: { '@type': 'Organization', name: SITE_NAME },
    ...(item.listing_type === 'auction' && item.auction_ends_at ? { priceValidUntil: String(item.auction_ends_at).slice(0, 10) } : {}),
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    description: item.giveaway_prize ? shorten(`Giveaway prize, not for sale. ${item.description || ''}`, 500) : shorten(item.description, 500) || item.title,
    sku: item.id,
    url: pageUrl,
    ...(image ? { image: [image] } : {}),
    ...(item.category ? { category: item.category } : {}),
    ...(props.length ? { additionalProperty: props } : {}),
    itemCondition: 'https://schema.org/UsedCondition',
    ...(item.giveaway_prize ? {} : { offers: offer }),
  };
}

export function breadcrumbJsonLd(trail) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(url ? { item: url } : {}) })) };
}
function itemListJsonLd(entries) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: entries.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_ORIGIN + '/item/' + e.id, name: e.title })) };
}
function breadcrumbHtml(trail) {
  return '<nav aria-label="Breadcrumb">' + trail.map(([name, url]) => url ? '<a href="' + escapeHtml(url) + '">' + escapeHtml(name) + '</a>' : '<span>' + escapeHtml(name) + '</span>').join(' › ') + '</nav>';
}
const listItems = (entries, withPrice = true) => entries.filter(l => l.id && l.title).map(l => '<li><a href="/item/' + escapeHtml(l.id) + '">' + escapeHtml(l.title) + '</a>' + (withPrice && money(l.price_cents) ? ' · ' + escapeHtml(money(l.price_cents)) : '') + '</li>').join('');

// The AI-written tags, shown as plain text. A tag already in the title is left out (no repeating), and at most eight are shown.
export function relatedTerms(item) {
  const title = String(item.title || '').toLowerCase();
  const seen = new Set();
  return (Array.isArray(item.tags) ? item.tags : []).map(tag => String(tag || '').trim()).filter(tag => {
    const key = tag.toLowerCase();
    if (!key || key.length > 40 || title.includes(key) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 8);
}

function itemBody(item, image, related) {
  const crumbs = [['Home', '/'], ...(CATEGORIES.includes(item.category) && !item.giveaway_prize ? [[item.category, categoryPath(item.category)]] : []), [item.title, null]];
  const details = detailPairs(item);
  const cert = issuerName(item);
  const seo = listingSeo(item);
  return '<main>' + breadcrumbHtml(crumbs) + '<h1>' + escapeHtml(item.title) + '</h1>' +
    (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(seo.alt) + '" width="640" />' : '') +
    (item.giveaway_prize ? '<p>Giveaway prize. Not for sale.</p><p><a href="/giveaway-rules">Official giveaway rules</a></p>' : '<p>' + escapeHtml(money(item.price_cents)) + (item.category ? ' · ' + escapeHtml(item.category) : '') + '</p>') +
    '<p>' + escapeHtml(item.description || '').replace(/\n/g, '<br />') + '</p>' +
    (details.length ? '<h2>Details</h2><ul>' + details.map(([k, v]) => '<li>' + escapeHtml(k) + ': ' + escapeHtml(v) + '</li>').join('') + '</ul>' : '') +
    (cert ? '<p>Certificate issuer listed: ' + escapeHtml(cert) + '</p>' : '') +
    (relatedTerms(item).length ? '<p>Related terms: ' + relatedTerms(item).map(escapeHtml).join(', ') + '</p>' : '') +
    (item.seller_slug ? '<p>Listed by <a href="/' + escapeHtml(item.seller_slug) + '">' + escapeHtml(item.seller_name || item.seller_slug) + '</a></p>' : '') +
    (related?.length ? '<h2>More ' + escapeHtml(item.category || '') + ' memorabilia</h2><ul>' + listItems(related) + '</ul>' : '') +
    CATEGORY_LINKS + NAV_LINKS + '</main>';
}

async function homeBody() {
  const [recent, entries] = await Promise.all([listingIndex(null, 24), sitemapData()]);
  const items = listItems(recent || []);
  const cats = (entries?.categories || []).map(c => '<li><a href="' + categoryPath(c.category) + '">' + escapeHtml(c.category) + ' memorabilia</a> (' + Number(c.count) + ')</li>').join('');
  const stores = (entries?.storefronts || []).map(slug => '<li><a href="/' + escapeHtml(slug) + '">' + escapeHtml(slug) + '</a></li>').join('');
  return '<main><h1>Credabilia | The Memorabilia Kingdom</h1><p>' + escapeHtml(HOME_DESCRIPTION) + '</p>' +
    (cats ? '<h2>Browse by category</h2><ul>' + cats + '</ul>' : '') + (items ? '<h2>Latest collectibles</h2><ul>' + items + '</ul>' : '') + (stores ? '<h2>Storefronts</h2><ul>' + stores + '</ul>' : '') + NAV_LINKS + '</main>';
}

async function buildMeta(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 2 && segments[0] === 'item') {
    const { ok, data: item } = await callRpcChecked('get_listing_preview', { p_id: segments[1] });
    if (!ok) return null;
    if (!item) return NOT_FOUND;
    // The resized ~640px JPEG at a stable address (api/email-image.js), not the multi-megabyte original on a temporary link: chat apps drop big images.
    const image = item.photo_path ? `${SITE_ORIGIN}/img/item/${segments[1]}` : DEFAULT_IMAGE;
    const photo = item.photo_path ? image : null;
    const pageUrl = `${SITE_ORIGIN}/item/${segments[1]}`;
    const related = item.giveaway_prize ? [] : ((await listingIndex(item.category, 6, segments[1])) || []).slice(0, 5);
    const seo = listingSeo(item);
    const trail = [['Home', SITE_ORIGIN + '/'], ...(CATEGORIES.includes(item.category) && !item.giveaway_prize ? [[item.category, SITE_ORIGIN + categoryPath(item.category)]] : []), [item.title, null]];
    return { title: seo.title, description: seo.description, image, ogType: 'product', body: itemBody({ ...item, id: segments[1] }, photo, related), jsonLd: [productJsonLd({ ...item, id: segments[1] }, pageUrl, photo), breadcrumbJsonLd(trail)] };
  }
  if (segments.length === 2 && segments[0] === 'category') {
    const name = categoryFromSlug(segments[1]);
    if (!name) return NOT_FOUND;
    const [entries, listings] = await Promise.all([sitemapData(), listingIndex(name, 60)]);
    if (!entries && !listings) return null;
    const count = (entries?.categories || []).find(c => c.category === name)?.count || (listings || []).length;
    const trail = [['Home', '/'], [name, null]];
    const url = SITE_ORIGIN + categoryPath(name);
    const intro = CATEGORY_INTRO[name];
    const others = CATEGORIES.filter(c => c !== name).map(c => '<a href="' + categoryPath(c) + '">' + escapeHtml(c) + '</a>').join(' · ');
    return {
      title: `${name} Memorabilia and Collectibles | ${SITE_NAME}`,
      description: count ? `Browse ${count} ${name.toLowerCase()} memorabilia and collectible listing${count === 1 ? '' : 's'} on ${SITE_NAME}, with photos, prices and seller storefronts.` : `${name} memorabilia and collectibles on ${SITE_NAME}. ${intro}`,
      image: DEFAULT_IMAGE,
      robots: count ? null : 'noindex, follow',
      body: '<main>' + breadcrumbHtml(trail) + '<h1>' + escapeHtml(name) + ' memorabilia and collectibles</h1><p>' + escapeHtml(intro) + '</p>' +
        (count ? '<p>' + count + ' listing' + (count === 1 ? '' : 's') + ' right now.</p><ul>' + listItems(listings || []) + '</ul>' : '<p>There are no ' + escapeHtml(name.toLowerCase()) + ' listings right now.</p>') +
        '<p>More categories: ' + others + '</p>' + NAV_LINKS + '</main>',
      jsonLd: [breadcrumbJsonLd([['Home', SITE_ORIGIN + '/'], [name, url]]), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${name} memorabilia and collectibles`, url, description: intro, ...(count ? { mainEntity: itemListJsonLd(listings || []) } : {}) }],
    };
  }
  if (segments.length === 0) return { title: 'Credabilia | The Memorabilia Kingdom', description: HOME_DESCRIPTION, image: DEFAULT_IMAGE, body: await homeBody() };
  if (segments.length === 1 && STATIC_PAGES[segments[0]]) {
    const page = STATIC_PAGES[segments[0]];
    return { title: page.title, description: page.description, image: DEFAULT_IMAGE, body: '<main><h1>' + escapeHtml(page.heading) + '</h1><p>' + escapeHtml(page.text) + '</p>' + NAV_LINKS + '</main>' };
  }
  if (segments.length === 1 && !RESERVED_SLUGS.has(segments[0])) {
    const { ok, data: store } = await callRpcChecked('get_storefront', { p_slug: segments[0] });
    if (!ok) return null;
    if (!store) return NOT_FOUND;
    const firstListing = store.listings?.[0];
    const image = firstListing?.media?.[0]?.path ? `${SITE_ORIGIN}/img/item/${firstListing.id}` : DEFAULT_IMAGE;
    const description = `Browse ${store.display_name}'s collection on Credabilia${store.sales_count ? ` — ${store.sales_count} sale${store.sales_count === 1 ? '' : 's'}` : ''}.`;
    const entries = (store.listings || []).filter(l => l.id && l.title);
    const url = SITE_ORIGIN + '/' + segments[0];
    return {
      title: `${store.display_name} | Credabilia Storefront`, description, image,
      body: '<main>' + breadcrumbHtml([['Home', '/'], [store.display_name, null]]) + '<h1>' + escapeHtml(store.display_name) + '</h1><p>' + escapeHtml(description) + '</p>' + (entries.length ? '<ul>' + listItems(entries, false) + '</ul>' : '') + CATEGORY_LINKS + NAV_LINKS + '</main>',
      jsonLd: [breadcrumbJsonLd([['Home', SITE_ORIGIN + '/'], [store.display_name, url]]), ...(entries.length ? [itemListJsonLd(entries)] : [])],
    };
  }
  return null;
}

// ---- Sitemaps ----------------------------------------------------------------------------------------------------------------------------------------------------------
// Public means an active listing from a member in good standing (see sitemap_entries): a new public listing is in the next sitemap, and one that is sold, archived, removed or
// made private is gone from it. lastmod is only written when the database has a real date for the page; home and the information pages have none, so they carry none.
const STATIC_URLS = ['/', '/help', '/terms', '/privacy', '/certificate', '/sell', '/giveaway-rules'];
const day = value => (value ? String(value).slice(0, 10) : '');

export function sitemapUrls(data, origin = SITE_ORIGIN) {
  const urls = STATIC_URLS.map(path => ({ loc: `${origin}${path}` }));
  for (const c of data?.categories || []) if (c.count > 0 && CATEGORIES.includes(c.category)) urls.push({ loc: `${origin}${categoryPath(c.category)}`, lastmod: day(c.lastmod) });
  for (const item of data?.listings || []) urls.push({ loc: `${origin}/item/${item.id}`, lastmod: day(item.updated_at || item.created_at) });
  const stores = data?.storefront_entries?.length ? data.storefront_entries : (data?.storefronts || []).map(slug => ({ slug }));
  for (const s of stores) urls.push({ loc: `${origin}/${s.slug}`, lastmod: day(s.lastmod) });
  return urls;
}
const urlsetXml = urls => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${escapeHtml(u.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n') + '\n</urlset>\n';

// One file while it fits; above the limit, /sitemap.xml becomes an index of /sitemaps/pages-N.xml files.
export function buildSitemapFiles(data, origin = SITE_ORIGIN, limit = SITEMAP_URL_LIMIT) {
  const urls = sitemapUrls(data, origin);
  if (urls.length <= limit) return { index: null, files: { main: urlsetXml(urls) } };
  const files = {};
  const names = [];
  for (let i = 0; i * limit < urls.length; i++) { const name = `pages-${i + 1}.xml`; names.push(name); files[name] = urlsetXml(urls.slice(i * limit, (i + 1) * limit)); }
  const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + names.map(n => `  <sitemap>\n    <loc>${escapeHtml(`${origin}/sitemaps/${n}`)}</loc>\n  </sitemap>`).join('\n') + '\n</sitemapindex>\n';
  return { index, files };
}
const xmlResponse = (xml, status = 200) => new Response(xml, { status, headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });

// Google Merchant Center product feed (RSS 2.0 + the g: namespace Google requires). Every item here is one-of-a-kind seller-owned memorabilia, so identifier_exists is always false and
// brand/mpn/gtin are deliberately omitted -- submitting those (or leaving identifier_exists at its true default) gets items disapproved for claiming a barcode/brand they don't have.
// condition is always "used": these are resold collectibles, never factory-new retail goods, and Google defaults an omitted condition to "new", which would be wrong for every listing.
// Image links get a 30-day signed expiry (vs. the 7-day one used for link-preview og:image) since Merchant Center can re-check an already-ingested item's image independently of how
// often it re-fetches this feed, and a feed that goes stale between visits means Google quietly stops serving the item rather than erroring loudly.
const IMAGE_SIGN_TTL_FEED = 2592000; // 30 days

async function buildMerchantFeed(origin) {
  const listings = await callRpc('merchant_feed_listings', {});
  const items = await Promise.all((listings || []).map(async l => {
    const image = await signedImageUrl(l.photo_path, IMAGE_SIGN_TTL_FEED);
    if (!image) return null; // Merchant Center requires image_link -- skip rather than submit an item that will just be rejected
    return `  <item>
    <g:id>${escapeHtml(l.id)}</g:id>
    <g:title>${escapeHtml(l.title)}</g:title>
    <g:description>${escapeHtml(l.description)}</g:description>
    <link>${escapeHtml(`${origin}/item/${l.id}`)}</link>
    <g:image_link>${escapeHtml(image)}</g:image_link>
    <g:availability>in_stock</g:availability>
    <g:price>${(l.price_cents / 100).toFixed(2)} USD</g:price>
    <g:condition>used</g:condition>
    <g:identifier_exists>false</g:identifier_exists>
    <g:product_type>${escapeHtml(l.category)}</g:product_type>
    <g:shipping_weight>${l.weight_oz} oz</g:shipping_weight>
  </item>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n<channel>\n  <title>Credabilia</title>\n  <link>${origin}</link>\n  <description>Collectibles and memorabilia for sale on Credabilia.</description>\n${items.filter(Boolean).join('\n')}\n</channel>\n</rss>\n`;
}

// ---- HTML for crawlers ------------------------------------------------------------------------------------------------------------------------------------------------
export function injectMeta(html, meta, pageUrl) {
  const social = `<meta name="twitter:title" content="${escapeHtml(meta.title)}" /><meta name="twitter:description" content="${escapeHtml(meta.description)}" /><meta name="twitter:image" content="${escapeHtml(meta.image)}" />`;
  const ld = (Array.isArray(meta.jsonLd) ? meta.jsonLd : meta.jsonLd ? [meta.jsonLd] : []).map(j => '<script type="application/ld+json">' + JSON.stringify(j).replace(/</g, '\\u003c') + '</script>').join('');
  return html
    .replace('<title>Credabilia | The Memorabilia Kingdom</title>', `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(meta.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`)
    .replace(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${escapeHtml(meta.ogType || 'website')}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(meta.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(meta.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
    .replace('<div id="root"></div>', () => '<div id="root">' + (meta.body || '') + '</div>')
    .replace('</head>', () => `<meta name="robots" content="${escapeHtml(meta.robots || 'index, follow, max-image-preview:large')}" /><meta name="twitter:card" content="summary_large_image" />${social}${ld}</head>`);
}

export default async function middleware(request) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return next();

  const url = new URL(request.url);
  if (url.pathname === '/sitemap.xml' || url.pathname.startsWith('/sitemaps/')) {
    const data = await sitemapData();
    if (!data) return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'retry-after': '300', 'cache-control': 'no-store' } });
    const built = buildSitemapFiles(data, SITE_ORIGIN);
    if (url.pathname === '/sitemap.xml') return xmlResponse(built.index || built.files.main);
    const name = url.pathname.slice('/sitemaps/'.length);
    return built.files[name] ? xmlResponse(built.files[name]) : new Response('Not found', { status: 404 });
  }
  if (url.pathname === '/products.xml') {
    const xml = await buildMerchantFeed(url.origin);
    return xmlResponse(xml);
  }
  if (!isCrawler(request.headers.get('user-agent'))) return next();

  const meta = await buildMeta(url.pathname);
  if (!meta) return next();

  const origin = await fetch(new URL('/index.html', url));
  if (!origin.ok) return next();
  // The single-page app answers every address with 200, so search engines took made-up addresses (the old Credabilia app's pages) for real ones and kept them listed. For crawlers,
  // an item, storefront or category that does not exist now says 404 and "do not index"; people still get the app as before.
  if (meta === NOT_FOUND) {
    return new Response(await origin.text(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'public, max-age=0, s-maxage=60' } });
  }
  const html = injectMeta(await origin.text(), meta, canonicalUrl(url));
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
