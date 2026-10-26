// Everything the podcast sync decides, as plain functions with no network or database, so it can be tested on its own.
//
// Nothing here uses AI. An episode page is built only from what the podcast host's feed says: the title, date, audio, picture and the description text, which is turned into
// plain text (all HTML removed) so nothing in a description can ever run on the page or talk to a model. Facts are never invented, filled in or "improved".

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
export function decodeEntities(text) {
  return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

// HTML in, plain text out. Paragraph and line breaks become line breaks; every tag (and anything that looks like one) is removed.
export function htmlToText(html) {
  const text = decodeEntities(String(html || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .replace(/<[^>]*>/g, '') // tags that were written as entities (&lt;script&gt;) are text now: remove those too
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function tag(block, name) {
  const match = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
}
const attr = (block, name, attribute) => block.match(new RegExp('<' + name + '\\s[^>]*' + attribute + '="([^"]+)"'))?.[1] || null;

export function safeHttpsUrl(value, max = 600) {
  try {
    const url = new URL(decodeEntities(String(value || '').trim()));
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > max) return null;
    const host = url.hostname;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
    return url.href;
  } catch { return null; }
}

const seconds = value => {
  if (!value) return null;
  const parts = String(value).trim().split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return null;
  const total = parts.length === 1 ? parts[0] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  return total > 0 && total < 86400 ? Math.round(total) : null;
};

// { channel, items, skipped }. An item missing its id, title or a real date is skipped (and counted), never half saved. Throws when the text is not a podcast feed at all,
// so an error page or an empty reply can never be mistaken for "no episodes".
export function parseFeed(xml) {
  const text = String(xml || '');
  if (!/<rss[\s>]/.test(text) || !/<channel[\s>]/.test(text)) throw new Error('The response is not a podcast feed.');
  const channelHead = text.slice(0, text.indexOf('<item>') === -1 ? text.length : text.indexOf('<item>'));
  const blocks = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  const items = [], skipped = [];
  for (const block of blocks) {
    const guid = htmlToText(tag(block, 'guid') || '').slice(0, 200);
    const title = htmlToText(tag(block, 'title') || '').replace(/\s+/g, ' ');
    const published = new Date(tag(block, 'pubDate') || '');
    if (!guid || !title || Number.isNaN(published.getTime())) { skipped.push(guid || title || '(no id)'); continue; }
    items.push({
      guid, title: title.slice(0, 300), published_at: published.toISOString(),
      link: safeHttpsUrl(tag(block, 'link')),
      audio_url: safeHttpsUrl(attr(block, 'enclosure', 'url'), 1200),
      image_url: safeHttpsUrl(attr(block, 'itunes:image', 'href'), 1200),
      duration_seconds: seconds(tag(block, 'itunes:duration')),
      text: htmlToText(tag(block, 'content:encoded') || tag(block, 'description') || ''),
    });
  }
  return { channel: { title: htmlToText(tag(channelHead, 'title') || '') }, items, skipped };
}

// The host's titles end with a show name that differs from episode to episode; the page already says which show it is, so those endings come off the page title.
export function cleanTitle(title) {
  return String(title || '').replace(/\s*[|–—-]\s*(the\s+memorabilia\s+kingdom(\s+podcast)?|memorabilia\s+kingdom|the\s+morning\s+show)\s*$/i, '').trim();
}

// "David's Take" is the morning show, where David is on video in his real voice. Everything else is the AI-hosted show.
export const kindOf = title => /^\s*david['’]?s take\b/i.test(title) ? 'davids_take' : 'ai_hosted';

// The description with the housekeeping removed: hashtag lines, the optional labelled block (Format / Voices / Source), and trailing hashtags.
// Music credits stay, because the music licence requires them.
export function bodyOf(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map(paragraph => paragraph
    .split('\n').filter(line => !/^\s*(format|voices?|source(\s*\d+)?)\s*:/i.test(line)).join('\n')
    .replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim())
    .filter(paragraph => paragraph && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(paragraph));
  return paragraphs.join('\n\n');
}

// Source links Grok's Newsroom bot found for the story, from lines like "Source: https://...". Only real https addresses count; at most three.
export function sourcesOf(text) {
  const found = [];
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^\s*source(?:\s*\d+)?\s*:\s*(\S+)\s*$/i);
    if (!match) continue;
    const url = safeHttpsUrl(match[1].replace(/[.,;)]+$/, ''));
    if (url && !found.includes(url)) found.push(url);
  }
  return found.slice(0, 3);
}

export function summaryOf(body, max = 280) {
  const flat = String(body || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)).replace(/[\s,.;:—-]+$/, '') + '…';
}

export const MIN_INDEXABLE_CHARS = 300;
// New pages are open to Google only when they are the human-led show, name a real source for the story, and say enough to stand on their own. Everything else is still a
// real page (listeners, shared links and the sitemap-free address all work), just marked "do not index" until the operator opens it in the admin area.
export function decideIndexing({ kind, sources, body }) {
  if (kind !== 'davids_take') return { index_state: 'noindex', noindex_reason: 'AI-hosted episode' };
  if (!sources || sources.length === 0) return { index_state: 'noindex', noindex_reason: 'No source link for the story' };
  if (String(body || '').length < MIN_INDEXABLE_CHARS) return { index_state: 'noindex', noindex_reason: 'Not enough text yet' };
  return { index_state: 'index', noindex_reason: null };
}

export function slugify(title, taken = new Set()) {
  const base = cleanTitle(title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/\$/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let slug = base.length > 70 ? base.slice(0, 70).replace(/-[^-]*$/, '') || base.slice(0, 70) : base;
  slug = slug.replace(/^-+|-+$/g, '') || 'episode';
  if (!taken.has(slug)) return slug;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  throw new Error('Could not make a unique address for "' + title + '".');
}

// One feed item -> the record the database stores. The slug is NOT here: it is chosen once, when the episode is first seen, and never changed afterwards.
export function episodeRecord(item) {
  const body = bodyOf(item.text), sources = sourcesOf(item.text), kind = kindOf(item.title);
  return {
    guid: item.guid, title: item.title, display_title: cleanTitle(item.title), published_at: item.published_at, audio_url: item.audio_url, image_url: item.image_url,
    duration_seconds: item.duration_seconds, spotify_url: item.link, kind, sources, body, summary: summaryOf(body), ...decideIndexing({ kind, sources, body }),
  };
}
