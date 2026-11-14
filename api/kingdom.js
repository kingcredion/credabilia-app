// The Memorabilia Kingdom: /kingdom (archive, newest first) and /kingdom/<slug> (one story), drawn from
// public.kingdom_articles so a story that passes the automatic source check is live without a rebuild.
// Hand-built stories (static_page rows, e.g. the Lennon article) keep their own HTML file and only
// appear in the archive list; vercel.json routes their addresses to those files.
const SITE = 'https://credabilia.com';
const STYLE = `*{box-sizing:border-box}body{margin:0;background:#f9f7ee;color:#19342e;font:18px/1.6 system-ui,sans-serif}header{background:#0b2923;color:#faf5de;border-bottom:3px solid #bd9754}header div,main{max-width:52rem;margin:auto;padding:2rem clamp(1.25rem,5vw,3rem)}header a{color:#f2d193;font-weight:650}h1,h2{font-family:Georgia,serif;line-height:1.1;text-wrap:balance}h1{font-size:clamp(2.6rem,7vw,4.6rem);margin:2rem 0 1rem}h2{font-size:clamp(1.6rem,4vw,2.35rem);margin:.55rem 0}article{padding:1.5rem 0;border-bottom:1px solid #d0c7ad}time{color:#53665c;font-size:.9rem}h2 a{color:inherit;text-decoration-thickness:1px;text-underline-offset:4px}p{margin:.7rem 0}`;
const STORY_STYLE = `*{box-sizing:border-box}body{margin:0;background:#faf8f1;color:#192f2b;font:18px/1.65 system-ui,sans-serif}header{background:#0b2923;padding:1rem max(6vw,calc((100vw - 46rem)/2));border-bottom:3px solid #cda85d}header a{color:#f5dd9d;text-decoration:none;font-weight:700}main{max-width:46rem;margin:auto;padding:3rem 1.3rem 5rem}h1,h2{font-family:Georgia,serif;line-height:1.1;text-wrap:balance}h1{font-size:clamp(2.4rem,7vw,3.8rem);margin:.6rem 0 1.4rem}h2{font-size:clamp(1.45rem,4vw,1.9rem);margin:2.2rem 0 .4rem}small,small a,.note{color:#53665c}a{color:#1d5a4c}p a{white-space:nowrap}.note{font-size:.9rem;border-top:1px solid #d6ccb0;margin-top:3rem;padding-top:1rem}`;

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const displayDate = date => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
const sourceLabel = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Source'; } };
const safeHttps = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };

export function archivePage(stories) {
  const cards = stories.map(({ title, published_on, description, slug }) =>
    `<article><time datetime="${escapeHtml(published_on)}">${displayDate(published_on)}</time><h2><a href="/kingdom/${escapeHtml(slug)}">${escapeHtml(title)}</a></h2><p>${escapeHtml(description)}</p></article>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Memorabilia Kingdom | Credabilia</title><meta name="description" content="Explore Credabilia’s stories about memorabilia, provenance and the evidence behind notable sales.">
<link rel="canonical" href="${SITE}/kingdom">
<style>${STYLE}</style>
</head><body><header><div><a href="/">Credabilia</a><h1>The Memorabilia Kingdom</h1></div></header><main aria-label="Published stories">${cards}</main></body></html>\n`;
}

export function storyPage(story) {
  const sections = (Array.isArray(story.sections) ? story.sections : []).map(s => {
    const href = safeHttps(s.source);
    return (s.heading ? `<h2>${escapeHtml(s.heading)}</h2>\n` : '') +
      `<p>${escapeHtml(s.text)}${href ? ` <a href="${escapeHtml(href)}" rel="noopener">${escapeHtml(sourceLabel(href))}</a>` : ''}</p>`;
  }).join('\n');
  const url = `${SITE}/kingdom/${story.slug}`;
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: story.title, description: story.description, datePublished: story.published_on, url, publisher: { '@type': 'Organization', name: 'Credabilia', url: SITE } }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(story.title)} | Credabilia</title>
<meta name="description" content="${escapeHtml(story.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(story.title)}"><meta property="og:description" content="${escapeHtml(story.description)}"><meta property="og:url" content="${url}">
<meta property="article:published_time" content="${escapeHtml(story.published_on)}">
<script type="application/ld+json">${jsonLd}</script>
<style>${STORY_STYLE}</style></head><body><header><a href="/">Credabilia</a></header><main><article><small><a href="/kingdom">The Memorabilia Kingdom</a> · <time datetime="${escapeHtml(story.published_on)}">${displayDate(story.published_on)}</time></small>
<h1>${escapeHtml(story.title)}</h1>
${sections}
<p class="note">Each paragraph links to the page it was automatically checked against before publishing.</p>
</article></main></body></html>\n`;
}

const NOT_FOUND = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Story not found | Credabilia</title><meta name="robots" content="noindex"><style>${STORY_STYLE}</style></head><body><header><a href="/">Credabilia</a></header><main><h1>Story not found</h1><p><a href="/kingdom">Back to The Memorabilia Kingdom</a></p></main></body></html>`;

export function createHandler({ env, fetcher = fetch }) {
  const supabaseUrl = env('VITE_SUPABASE_URL'), key = env('VITE_SUPABASE_PUBLISHABLE_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const send = (res, status, html, cache) => { res.statusCode = status; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', cache); res.end(html); };
  return async (req, res) => {
    const raw = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
    try {
      if (!supabaseUrl || !key) throw Error('Supabase is not configured');
      if (raw === undefined || raw === '') {
        const r = await fetcher(`${supabaseUrl}/rest/v1/kingdom_articles?select=slug,title,description,published_on&order=published_on.desc,created_at.desc`, { headers });
        if (!r.ok) throw Error('archive ' + r.status);
        return send(res, 200, archivePage(await r.json()), 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
      }
      if (typeof raw !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw) || raw.length > 90) return send(res, 404, NOT_FOUND, 'public, max-age=60');
      const r = await fetcher(`${supabaseUrl}/rest/v1/kingdom_articles?select=slug,title,description,published_on,sections&static_page=eq.false&slug=eq.${raw}`, { headers });
      if (!r.ok) throw Error('story ' + r.status);
      const [story] = await r.json();
      if (!story) return send(res, 404, NOT_FOUND, 'public, max-age=60, s-maxage=60');
      return send(res, 200, storyPage(story), 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    } catch (error) {
      console.error('kingdom failed', error?.message);
      return send(res, 503, NOT_FOUND.replace('Story not found', 'The Kingdom is briefly unavailable'), 'no-store');
    }
  };
}

export default createHandler({ env: name => process.env[name] });
