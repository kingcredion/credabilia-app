import { next } from '@vercel/functions';

// Link-share previews only -- generates real og:title/description/image for /item/:id and
// /:storefrontSlug so a link pasted into iMessage/Discord/Twitter/etc. shows the actual item or
// seller, not the generic site-wide card. Scoped to known crawler user agents (see BOT_UA below)
// rather than every request: those clients never run the SPA's own JS, so they're the only ones
// who'd otherwise see stale meta tags -- real visitors get the real page instantly, with no extra
// Supabase round trip added to their load, and the SPA itself fixes document.title client-side.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DEFAULT_IMAGE = 'https://credabilia.com/brand/app-icons/crown-c/web/icon-512.png';
const RESERVED_SLUGS = new Set(['terms', 'privacy', 'help', 'auth', 'item', 'sell', 'certificate']);
const BOT_UA = /bot|facebookexternalhit|facebookcatalog|twitterbot|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|applebot|pinterest|redditbot|vkshare|skypeuripreview|embedly|quora|outbrain|iframely|w3c_validator/i;

export const config = {
  matcher: ['/', '/item/:id', '/:slug([^/.]+)', '/sitemap.xml', '/products.xml'],
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(cents) {
  return typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '';
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

// Returned by buildMeta when the lookup worked and there is simply no such item or storefront.
export const NOT_FOUND = Symbol('not found');

// RLS lets anon sign a path only when it belongs to an active listing's media (see
// read_listing_media's storage.objects policy), which is exactly the set of photos this
// middleware ever has reason to ask for -- see get_listing_preview()/get_storefront().
async function signedImageUrl(path, expiresIn = 604800) {
  if (!path) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/listing-media/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ expiresIn }), // default 7 days -- plenty for a link-preview cache, well under any crawler's re-fetch window
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
  } catch { return null; }
}

// Crawlers get each page's own title, description and self-referencing canonical, plus a plain-HTML copy of its main content: the app is a
// single page that only draws itself with JavaScript, so without this every address looked like the home page to a crawler that does not run it.
const SITE_NAME = 'Credabilia';
const HOME_DESCRIPTION = 'Credabilia is The Memorabilia Kingdom: buy and sell collectibles, explore certificate details, and collect with confidence.';
const STATIC_PAGES = {
  help: { title: 'Help Center | Credabilia', description: 'Answers about buying, selling, shipping, payment protection, certificates and community audits on Credabilia.', heading: 'Credabilia Help Center', text: 'Answers about buying, selling, shipping, how your payment is held until delivery, certificates of authenticity and community audits.' },
  terms: { title: 'Terms of Service | Credabilia', description: 'The terms for buying and selling on Credabilia, including payment holds, refunds, shipping and certificates.', heading: 'Credabilia Terms of Service', text: 'The terms for buying and selling on Credabilia, including how payments are held until delivery, refunds, shipping and certificates.' },
  privacy: { title: 'Privacy Policy | Credabilia', description: 'How Credabilia collects, uses and protects your information.', heading: 'Credabilia Privacy Policy', text: 'How Credabilia collects, uses and protects your information.' },
  certificate: { title: 'Certificate lookup | Credabilia', description: 'Search a certificate number from PSA/DNA, JSA, Beckett (BAS) and other issuers to see whether it appears on a Credabilia listing.', heading: 'Certificate lookup', text: 'Search a certificate number from PSA/DNA, JSA, Beckett (BAS) and other issuers to see whether it appears on a Credabilia listing.' },
  sell: { title: 'Sell your memorabilia | Credabilia', description: 'List signed memorabilia and collectibles on Credabilia. Get paid through Stripe after delivery, with item credibility scores that help buyers trust your listing.', heading: 'Sell your memorabilia on Credabilia', text: 'List signed memorabilia and collectibles. You are paid through Stripe after delivery, and item credibility scores help buyers trust your listing.' },
};

// Cut at a word boundary so a description never ends mid-word.
export function shorten(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s,.;:-]+$/, '') + '…';
}

const NAV_LINKS = '<nav><a href="/">Credabilia</a> · <a href="/help">Help</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/certificate">Certificate lookup</a> · <a href="/sell">Sell</a></nav>';

// schema.org Product for one listing, so Google can show price and availability. Only facts the listing already states publicly.
export function productJsonLd(item, pageUrl, image) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    description: shorten(item.description, 500) || item.title,
    sku: item.id,
    url: pageUrl,
    ...(image ? { image: [image] } : {}),
    ...(item.category ? { category: item.category } : {}),
    itemCondition: 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'USD',
      price: (item.price_cents / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
    },
  };
}

function itemBody(item, image) {
  return '<main><h1>' + escapeHtml(item.title) + '</h1>' + (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(item.title) + '" width="640" />' : '') +
    '<p>' + escapeHtml(money(item.price_cents)) + (item.category ? ' · ' + escapeHtml(item.category) : '') + '</p><p>' + escapeHtml(item.description || '').replace(/\n/g, '<br />') + '</p>' + NAV_LINKS + '</main>';
}

async function homeBody() {
  const [feed, entries] = await Promise.all([callRpc('merchant_feed_listings', {}), callRpc('sitemap_entries', {})]);
  const items = (feed || []).map(l => '<li><a href="/item/' + escapeHtml(l.id) + '">' + escapeHtml(l.title) + '</a> · ' + escapeHtml(money(l.price_cents)) + '</li>').join('');
  const stores = (entries?.storefronts || []).map(slug => '<li><a href="/' + escapeHtml(slug) + '">' + escapeHtml(slug) + '</a></li>').join('');
  return '<main><h1>Credabilia | The Memorabilia Kingdom</h1><p>' + escapeHtml(HOME_DESCRIPTION) + '</p>' +
    (items ? '<h2>Featured collectibles</h2><ul>' + items + '</ul>' : '') + (stores ? '<h2>Storefronts</h2><ul>' + stores + '</ul>' : '') + NAV_LINKS + '</main>';
}

async function buildMeta(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 2 && segments[0] === 'item') {
    const { ok, data: item } = await callRpcChecked('get_listing_preview', { p_id: segments[1] });
    if (!ok) return null;
    if (!item) return NOT_FOUND;
    // The resized ~640px JPEG at a stable address (api/email-image.js), not the multi-megabyte original on a temporary link: chat apps drop big images.
    const image = item.photo_path ? `https://credabilia.com/img/item/${segments[1]}` : DEFAULT_IMAGE;
    const description = [money(item.price_cents), item.category, shorten(item.description, 150)].filter(Boolean).join(' · ');
    const photo = item.photo_path ? image : null;
    return { title: `${item.title} | Credabilia`, description, image, body: itemBody(item, photo), jsonLd: productJsonLd({ ...item, id: segments[1] }, `https://credabilia.com/item/${segments[1]}`, photo) };
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
    const image = firstListing?.media?.[0]?.path ? `https://credabilia.com/img/item/${firstListing.id}` : DEFAULT_IMAGE;
    const description = `Browse ${store.display_name}'s collection on Credabilia${store.sales_count ? ` — ${store.sales_count} sale${store.sales_count === 1 ? '' : 's'}` : ''}.`;
    const links = (store.listings || []).filter(l => l.id && l.title).map(l => '<li><a href="/item/' + escapeHtml(l.id) + '">' + escapeHtml(l.title) + '</a></li>').join('');
    return { title: `${store.display_name} | Credabilia Storefront`, description, image, body: '<main><h1>' + escapeHtml(store.display_name) + '</h1><p>' + escapeHtml(description) + '</p>' + (links ? '<ul>' + links + '</ul>' : '') + NAV_LINKS + '</main>' };
  }
  return null;
}

// Dynamic /sitemap.xml -- replaces the old static file (which only ever listed 4 fixed pages,
// so every real listing and storefront was invisible to search engines). Served to every
// requester, not just BOT_UA, since this is a machine-readable endpoint by definition, not an
// HTML page needing bot-only treatment.
const STATIC_URLS = ['/', '/help', '/terms', '/privacy', '/certificate', '/sell'];

async function buildSitemap(origin) {
  const data = await callRpc('sitemap_entries', {});
  const urls = STATIC_URLS.map(path => ({ loc: `${origin}${path}` }));
  for (const item of data?.listings || []) urls.push({ loc: `${origin}/item/${item.id}`, lastmod: item.created_at });
  for (const slug of data?.storefronts || []) urls.push({ loc: `${origin}/${slug}` });
  const body = urls.map(u => `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Google Merchant Center product feed (RSS 2.0 + the g: namespace Google requires). Every item
// here is one-of-a-kind seller-owned memorabilia, so identifier_exists is always false and
// brand/mpn/gtin are deliberately omitted -- submitting those (or leaving identifier_exists at
// its true default) gets items disapproved for claiming a barcode/brand they don't have.
// condition is always "used": these are resold collectibles, never factory-new retail goods, and
// Google defaults an omitted condition to "new", which would be wrong for every single listing.
// Image links get a 30-day signed expiry (vs. the 7-day one used for link-preview og:image) since
// Merchant Center can re-check an already-ingested item's image independently of how often it
// re-fetches this feed, and a feed that goes stale between visits means Google quietly stops
// serving the item rather than erroring loudly.
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

function injectMeta(html, meta, pageUrl) {
  return html
    .replace('<title>Credabilia | The Memorabilia Kingdom</title>', `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`
    )
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(meta.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(meta.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
    .replace('<div id="root"></div>', () => '<div id="root">' + (meta.body || '') + '</div>')
    .replace('</head>', () => '<meta name="robots" content="index, follow, max-image-preview:large" /><meta name="twitter:card" content="summary_large_image" />' + (meta.jsonLd ? '<script type="application/ld+json">' + JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c') + '</script>' : '') + '</head>');
}

export default async function middleware(request) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return next();

  const url = new URL(request.url);
  if (url.pathname === '/sitemap.xml') {
    const xml = await buildSitemap(url.origin);
    return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  }
  if (url.pathname === '/products.xml') {
    const xml = await buildMerchantFeed(url.origin);
    return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  }
  if (!BOT_UA.test(request.headers.get('user-agent') || '')) return next();

  const meta = await buildMeta(url.pathname);
  if (!meta) return next();

  const origin = await fetch(new URL('/index.html', url));
  if (!origin.ok) return next();
  // The single-page app answers every address with 200, so search engines took made-up addresses (the old Credabilia app's pages) for real ones and
  // kept them listed. For crawlers, an item or storefront that does not exist now says 404 and "do not index"; people still get the app as before.
  if (meta === NOT_FOUND) {
    return new Response(await origin.text(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'public, max-age=0, s-maxage=60' } });
  }
  const html = injectMeta(await origin.text(), meta, url.toString());
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
