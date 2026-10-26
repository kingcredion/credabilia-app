// Called hourly by pg_cron (202610260166_podcast_sync_schedule.sql) via pg_net, authenticated with the real service role key as a Supabase-issued JWT.
//
// Reads the show's public RSS feed and saves every episode (see feed.js) so /podcast/<slug> can show it, with no commit or deploy per episode. Idempotent: running it twice
// changes nothing the second time. It only ever adds and updates. It never deletes, so a feed outage, a half-sent reply or a host hiccup cannot remove a published page: when
// the feed cannot be read, or is not the show's feed, or has no episodes, nothing is touched and the failure is logged for the admin area.
import { parseFeed, episodeRecord, slugify } from './feed.js';

export const FEED_URL = 'https://anchor.fm/s/1190cdc34/podcast/rss';
const FEED_TIMEOUT_MS = 15000, MAX_FEED_BYTES = 3 * 1024 * 1024, MAX_EPISODES = 300, BATCH = 100;

// With "verify JWT" on, Supabase has already checked the signature; this only requires that the caller is the service role, so the public anon key cannot start a sync.
function isServiceRole(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch { return false; }
}

export async function readFeed(url, fetchFn) {
  if (!/^https:\/\//.test(url)) throw new Error('The feed address must be https.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal, headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'CredabiliaPodcastSync/1.0 (+https://credabilia.com/podcast)' } });
    if (!response.ok) throw new Error('The feed answered with status ' + response.status + '.');
    if (Number(response.headers?.get?.('content-length')) > MAX_FEED_BYTES) throw new Error('The feed is larger than expected.');
    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) throw new Error('The feed is larger than expected.');
    return text;
  } catch (error) {
    throw new Error(error?.name === 'AbortError' ? 'The feed did not answer in time.' : error.message);
  } finally { clearTimeout(timer); }
}

export function createHandler({ createClient, env, fetchFn = fetch }) {
  const reply = (body, status = 200) => Response.json(body, { status });
  return async request => {
    if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    if (!isServiceRole(request)) return reply({ error: 'Not allowed.' }, 403);
    const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const log = (ok, counts, note) => service.rpc('podcast_log_sync', { p_ok: ok, p_found: counts?.found || 0, p_inserted: counts?.inserted || 0, p_changed: counts?.changed || 0, p_skipped: counts?.skipped || 0, p_note: note || null }).then(() => {}, () => {});
    try {
      const feed = parseFeed(await readFeed(env('PODCAST_FEED_URL') || FEED_URL, fetchFn));
      // The official feed names the show; anything else (a redirect to a different feed, an error page that happens to be XML) is refused.
      if (!/memorabilia kingdom/i.test(feed.channel.title)) throw new Error('The feed is not The Memorabilia Kingdom Podcast.');
      if (feed.items.length === 0) throw new Error('The feed has no readable episodes, so nothing was changed.');

      const known = await service.rpc('podcast_known_episodes');
      if (known.error) throw new Error('Could not read saved episodes: ' + known.error.message);
      const slugs = new Map((known.data || []).map(row => [row.guid, row.slug]));
      const taken = new Set(slugs.values());
      const records = [];
      // Oldest first, so when two episodes would share an address the original keeps it.
      for (const item of [...feed.items].sort((a, b) => a.published_at.localeCompare(b.published_at)).slice(-MAX_EPISODES)) {
        const record = episodeRecord(item);
        record.slug = slugs.get(item.guid) || slugify(record.title, taken);
        taken.add(record.slug);
        records.push(record);
      }
      let inserted = 0, changed = 0;
      for (let i = 0; i < records.length; i += BATCH) {
        const saved = await service.rpc('podcast_upsert_episodes', { p_items: records.slice(i, i + BATCH) });
        if (saved.error) throw new Error('Could not save episodes: ' + saved.error.message);
        inserted += saved.data?.inserted || 0; changed += saved.data?.changed || 0;
      }
      const counts = { found: feed.items.length, inserted, changed, skipped: feed.skipped.length };
      await log(true, counts, feed.skipped.length ? 'Skipped unreadable items: ' + feed.skipped.slice(0, 5).join(', ') : null);
      return reply({ ok: true, ...counts });
    } catch (error) {
      await log(false, null, error.message);
      return reply({ ok: false, error: error.message }, 502);
    }
  };
}
