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
  matcher: ['/item/:id', '/:slug([^/.]+)'],
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
async function signedImageUrl(path) {
  if (!path) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/listing-media/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ expiresIn: 604800 }), // 7 days -- plenty for a link-preview cache, well under any crawler's re-fetch window
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
  if (!BOT_UA.test(request.headers.get('user-agent') || '')) return next();

  const url = new URL(request.url);
  const meta = await buildMeta(url.pathname);
  if (!meta) return next();

  const origin = await fetch(new URL('/', url));
  if (!origin.ok) return next();
  const html = injectMeta(await origin.text(), meta, url.toString());
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
