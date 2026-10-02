import sharp from 'sharp';

// Email-sized item photo for Klaviyo (and any other email): credabilia.com/img/item/:id is rewritten to
// this function by vercel.json. The listing-media bucket is private and its photos are full-size
// background-removed PNGs (often 3MB+), so a raw signed URL would both expire and be far too heavy for
// an email. This fetches a fresh signed copy, flattens it onto the email's cream card colour and
// serves a ~640px JPEG that mail clients' image proxies can cache.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_IMAGE = 'https://credabilia.com/brand/app-icons/crown-c/web/icon-512.png';
const CARD_BG = '#f1ecd9';

export function createHandler({ env, fetcher = fetch }) {
  const supabaseUrl = env('VITE_SUPABASE_URL'), key = env('VITE_SUPABASE_PUBLISHABLE_KEY');
  const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
  return async (req, res) => {
    const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    const fallback = () => { res.statusCode = 302; res.setHeader('Location', DEFAULT_IMAGE); res.setHeader('Cache-Control', 'public, max-age=300'); res.end(); };
    if (!supabaseUrl || !key || typeof id !== 'string' || !UUID_RE.test(id)) return fallback();
    try {
      const pathResponse = await fetcher(`${supabaseUrl}/rest/v1/rpc/get_listing_photo_path`, { method: 'POST', headers, body: JSON.stringify({ p_id: id }) });
      const path = pathResponse.ok ? await pathResponse.json() : null;
      if (typeof path !== 'string' || !path) return fallback();
      const signResponse = await fetcher(`${supabaseUrl}/storage/v1/object/sign/listing-media/${path}`, { method: 'POST', headers, body: JSON.stringify({ expiresIn: 300 }) });
      const signed = signResponse.ok ? (await signResponse.json()).signedURL : null;
      if (!signed) return fallback();
      const photo = await fetcher(`${supabaseUrl}/storage/v1${signed}`);
      if (!photo.ok) return fallback();
      const jpeg = await sharp(Buffer.from(await photo.arrayBuffer()))
        .rotate().resize({ width: 640, withoutEnlargement: true })
        .flatten({ background: CARD_BG }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/jpeg');
      // Cached at the edge for a day and by mail clients' proxies; a replaced photo shows up within a day.
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.end(jpeg);
    } catch (error) { console.error("email-image failed", error?.message); fallback(); }
  };
}

export default createHandler({ env: name => process.env[name] });
