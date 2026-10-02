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
const RESERVED_SLUGS = new Set(['terms', 'privacy', 'help', 'auth', 'item']);
const BOT_UA = /bot|facebookexternalhit|facebookcatalog|twitterbot|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|applebot|pinterest|redditbot|vkshare|skypeuripreview|embedly|quora|outbrain|iframely|w3c_validator/i;

export const config = {
  matcher: ['/item/:id', '/:slug([^/.]+)', '/sitemap.xml', '/products.xml'],
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(cents) {
  return typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '';
}

async function callRpc(name, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

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

async function buildMeta(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 2 && segments[0] === 'item') {
    const item = await callRpc('get_listing_preview', { p_id: segments[1] });
    if (!item) return null;
    const image = (await signedImageUrl(item.photo_path)) || DEFAULT_IMAGE;
    const description = [money(item.price_cents), item.category, (item.description || '').slice(0, 150)].filter(Boolean).join(' · ');
    return { title: `${item.title} | Credabilia`, description, image };
  }
  if (segments.length === 1 && !RESERVED_SLUGS.has(segments[0])) {
    const store = await callRpc('get_storefront', { p_slug: segments[0] });
    if (!store) return null;
    const photoPath = store.listings?.[0]?.media?.[0]?.path;
    const image = (await signedImageUrl(photoPath)) || DEFAULT_IMAGE;
    const description = `Browse ${store.display_name}'s collection on Credabilia${store.sales_count ? ` — ${store.sales_count} sale${store.sales_count === 1 ? '' : 's'}` : ''}.`;
    return { title: `${store.display_name} | Credabilia Storefront`, description, image };
  }
  return null;
}

// Dynamic /sitemap.xml -- replaces the old static file (which only ever listed 4 fixed pages,
// so every real listing and storefront was invisible to search engines). Served to every
// requester, not just BOT_UA, since this is a machine-readable endpoint by definition, not an
// HTML page needing bot-only treatment.
const STATIC_URLS = ['/', '/help', '/terms', '/privacy'];

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
    .replace('</head>', '<meta name="twitter:card" content="summary_large_image" /></head>');
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

  const origin = await fetch(new URL('/', url));
  if (!origin.ok) return next();
  const html = injectMeta(await origin.text(), meta, url.toString());
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
