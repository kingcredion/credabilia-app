// Daily search check for The Memorabilia Kingdom (pg_cron, 202611140178_kingdom_search_schedule.sql). It only reads: it never publishes, edits or withdraws anything,
// and publishing never waits on it, so a Google outage can only delay this report.
//
// For /kingdom and every published story it checks two things and saves the result in kingdom_search_status:
//   our site:  the page opens (200), names itself as the preferred (canonical) address, is not marked noindex, is not blocked by robots.txt,
//              and is listed exactly once in /sitemap.xml;
//   Google:    Search Console's URL Inspection API (read-only scope): indexed or not, Google's coverage note, robots/fetch/indexing state,
//              the address Google picked as preferred, and the last crawl. Plus whether Search Console has /sitemap.xml and read it without errors.
// Google's Indexing API is only for job postings and livestreams, so discovery is left to the sitemap.
//
// One alert email at most per run ("Admin Alert: System Health" -> kingcredion@credabilia.com), and only for something that needs a person:
//   a broken page, a page or robots rule blocking Google, a sitemap problem, Google picking another address, a story still not indexed GRACE_DAYS after
//   publishing, or Search Console unreachable for 3 runs in a row. Site problems are re-checked once before they count; Google-side problems must be seen
//   on two runs in a row. The same problem is not emailed again for a week.
const SITE = 'https://credabilia.com';
const SITEMAP = SITE + '/sitemap.xml';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UA = 'Mozilla/5.0 (compatible; CredabiliaSearchCheck/1.0; +https://credabilia.com/kingdom)';
export const GRACE_DAYS = 7;
const REMIND_DAYS = 7;
const PERSIST_HOURS = 20;
const DAY_MS = 86400000;

const canonicalOf = html => (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i) || [])[1] || null;
const metaNoindex = html => [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => /name=["'](robots|googlebot)["']/i.test(tag) && /content=["'][^"']*noindex/i.test(tag));

// robots.txt rules for Googlebot (its own group if there is one, otherwise "*"); longest matching rule wins, Allow wins a tie.
export function robotsBlocks(robotsTxt, path) {
  const groups = []; let current = null, lastWasAgent = false;
  for (const raw of String(robotsTxt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const field = m[1].toLowerCase(), value = m[2].trim();
    if (field === 'user-agent') { if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); } current.agents.push(value.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (current && (field === 'allow' || field === 'disallow')) current.rules.push({ allow: field === 'allow', path: value });
  }
  const group = groups.find(g => g.agents.some(a => a === 'googlebot')) || groups.find(g => g.agents.includes('*'));
  let best = null;
  for (const r of group?.rules || []) {
    if (!r.path) continue;
    const pattern = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (pattern.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !!best && !best.allow;
}

export function sitemapCounts(xml) {
  const counts = new Map();
  for (const [, loc] of String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) { const u = loc.replace(/&amp;/g, '&'); counts.set(u, (counts.get(u) || 0) + 1); }
  return counts;
}

// What our own site says about one address. Empty list = fine.
export function siteProblems({ url, status, html, xRobots, robotsTxt, sitemap }) {
  const out = [];
  if (status !== 200) out.push(status ? `the page returns HTTP ${status}` : 'the page did not answer');
  else {
    const canonical = canonicalOf(html || '');
    if (canonical !== url) out.push(canonical ? `the page names ${canonical} as its preferred address` : 'the page has no preferred (canonical) address');
    if (metaNoindex(html || '') || /noindex/i.test(xRobots || '')) out.push('the page tells search engines not to index it');
  }
  if (robotsBlocks(robotsTxt, new URL(url).pathname)) out.push('robots.txt blocks Google from it');
  const listed = sitemap ? sitemap.get(url) || 0 : null;
  if (listed !== null && listed !== 1) out.push(listed ? `it is listed ${listed} times in the sitemap` : 'it is missing from the sitemap');
  return out;
}

// What Google's URL Inspection result says needs attention. ageDays: days since publication.
export function googleProblems(url, result, ageDays) {
  const s = result?.indexStatusResult; if (!s) return [];
  const out = [];
  if (s.robotsTxtState === 'DISALLOWED') out.push('Google says robots.txt blocks it');
  if (s.indexingState && s.indexingState !== 'INDEXING_ALLOWED' && s.indexingState !== 'INDEXING_STATE_UNSPECIFIED') out.push(`Google sees an indexing block (${s.indexingState})`);
  if (s.pageFetchState && !['SUCCESSFUL', 'PAGE_FETCH_STATE_UNSPECIFIED'].includes(s.pageFetchState)) out.push(`Google's last fetch failed (${s.pageFetchState})`);
  if (s.googleCanonical && s.googleCanonical !== url) out.push(`Google picked ${s.googleCanonical} as the preferred address`);
  if (s.verdict !== 'PASS' && ageDays >= GRACE_DAYS) out.push(`not indexed ${Math.floor(ageDays)} days after publishing (Google: ${s.coverageState || s.verdict || 'unknown'})`);
  return out;
}

export function sitemapProblems(info) {
  if (!info) return [];
  if (info.missing) return ['Search Console does not have /sitemap.xml'];
  const out = [];
  if (Number(info.errors) > 0) out.push(`Search Console reports ${info.errors} error(s) reading /sitemap.xml`);
  if (info.isPending === false && !info.lastDownloaded) out.push('Search Console has not been able to read /sitemap.xml');
  return out;
}

// Decide whether a stored row's problem should be emailed now. Returns the updated row fields and whether to alert.
export function nextState(prev, problem, { now, persistent }) {
  if (!problem) return { row: { problem: null, problem_since: null, alerted_problem: null, alerted_at: null }, alert: false };
  const since = prev?.problem === problem && prev.problem_since ? new Date(prev.problem_since) : now;
  const lasted = persistent || now - since >= PERSIST_HOURS * 3600000;
  const remindDue = !prev?.alerted_at || now - new Date(prev.alerted_at) >= REMIND_DAYS * DAY_MS;
  const alert = lasted && (prev?.alerted_problem !== problem || remindDue);
  return { row: { problem, problem_since: since.toISOString(), alerted_problem: alert ? problem : prev?.alerted_problem ?? null, alerted_at: alert ? now.toISOString() : prev?.alerted_at ?? null }, alert };
}

async function googleToken(env, fetchFn) {
  const clientId = env('GOOGLE_SC_CLIENT_ID'), clientSecret = env('GOOGLE_SC_CLIENT_SECRET'), refreshToken = env('GOOGLE_SC_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Google access is not saved (GOOGLE_SC_* secrets).');
  const response = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('Google sign-in failed: ' + (body.error_description || body.error || response.status));
  return body.access_token;
}

export function createHandler({ createClient, env, fetchFn = fetch, now = () => new Date(), pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  return async request => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const bearer = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const { data: allowed } = bearer ? await service.rpc('kingdom_authorize_dispatch', { p_token: bearer }) : { data: false };
    if (allowed !== true) return new Response(null, { status: 403 });
    const started = now();
    try {
      const { data: stories, error } = await service.from('kingdom_articles').select('slug,published_on').is('withdrawn_at', null)
        .order('published_on', { ascending: false }).limit(100);
      if (error) throw new Error('Could not read stories: ' + error.message);
      const oldest = stories.map(s => s.published_on).sort()[0] || started.toISOString().slice(0, 10);
      const pages = [{ url: SITE + '/kingdom', slug: null, published_on: oldest }, ...stories.map(s => ({ url: `${SITE}/kingdom/${s.slug}`, slug: s.slug, published_on: s.published_on }))];

      const text = async url => { const r = await fetchFn(url, { headers: { 'User-Agent': UA } }); return r.ok ? await r.text() : null; };
      const robotsTxt = await text(SITE + '/robots.txt').catch(() => null);
      let sitemapXml = await text(SITEMAP).catch(() => null);
      if (sitemapXml && /<sitemapindex/i.test(sitemapXml)) {
        const parts = await Promise.all([...sitemapCounts(sitemapXml).keys()].map(u => text(u).catch(() => '')));
        sitemapXml = parts.join('\n');
      }
      const sitemap = sitemapXml ? sitemapCounts(sitemapXml) : null;

      const fetchPage = async url => {
        try {
          const r = await fetchFn(url, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html' } });
          return { status: r.status, html: r.status === 200 ? await r.text() : (await r.body?.cancel(), ''), xRobots: r.headers.get('x-robots-tag') };
        } catch { return { status: 0, html: '', xRobots: null }; }
      };
      const site = {};
      for (const p of pages) {
        let got = await fetchPage(p.url), problems = siteProblems({ url: p.url, ...got, robotsTxt, sitemap });
        if (problems.length) { await pause(5000); got = await fetchPage(p.url); problems = siteProblems({ url: p.url, ...got, robotsTxt, sitemap }); }
        site[p.url] = { status: got.status, canonical: canonicalOf(got.html || ''), in_sitemap: sitemap ? sitemap.get(p.url) || 0 : null, problems };
      }

      // Google. Any failure here is recorded and only alerts after 3 failed runs in a row.
      const gsc = env('GOOGLE_SC_SITE') || 'sc-domain:credabilia.com';
      let token = null, googleError = null, sitemapInfo = null;
      const google = {};
      try {
        token = await googleToken(env, fetchFn);
        const sm = await fetchFn(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gsc)}/sitemaps/${encodeURIComponent(SITEMAP)}`, { headers: { Authorization: 'Bearer ' + token } });
        const body = await sm.json().catch(() => ({}));
        if (sm.status === 404) sitemapInfo = { missing: true };
        else if (!sm.ok) throw new Error('Search Console sitemap check: ' + (body.error?.message || sm.status));
        else sitemapInfo = { lastSubmitted: body.lastSubmitted || null, lastDownloaded: body.lastDownloaded || null, isPending: body.isPending ?? null,
          errors: Number(body.errors || 0), warnings: Number(body.warnings || 0), submitted: body.contents?.[0]?.submitted ?? null };
        for (const p of pages) {
          const r = await fetchFn('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ inspectionUrl: p.url, siteUrl: gsc, languageCode: 'en-US' }) });
          const b = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error('URL Inspection: ' + (b.error?.message || r.status));
          google[p.url] = b.inspectionResult || null;
        }
      } catch (err) { googleError = String(err.message || err).slice(0, 300); }

      // Save each address, decide alerts.
      const { data: prevRows } = await service.from('kingdom_search_status').select('*');
      const prev = new Map((prevRows || []).map(r => [r.url, r]));
      const alerts = [], rows = [];
      const record = (url, extra, problems, persistent) => {
        const problem = problems.length ? problems.join('; ') : null;
        const keepGoogle = googleError && prev.get(url)?.google; // a Google outage keeps the last known Google result
        const { row, alert } = nextState(prev.get(url), problem, { now: started, persistent });
        rows.push({ url, checked_at: started.toISOString(), ...extra, ...(keepGoogle ? { google: prev.get(url).google } : {}), ...row });
        if (alert) alerts.push(`${url}: ${problem}`);
      };
      for (const p of pages) {
        const age = (started - new Date(p.published_on + 'T12:00:00Z')) / DAY_MS;
        const g = google[p.url];
        const googleSide = g ? googleProblems(p.url, g, age) : [];
        const s = g?.indexStatusResult;
        // Site problems were already re-checked, so they count at once; Google-side ones must last a day.
        const siteSide = site[p.url].problems;
        record(p.url, { slug: p.slug, published_on: p.published_on, site: site[p.url],
          google: g ? { verdict: s?.verdict ?? null, coverage: s?.coverageState ?? null, robots: s?.robotsTxtState ?? null, indexing: s?.indexingState ?? null,
            fetch: s?.pageFetchState ?? null, google_canonical: s?.googleCanonical ?? null, last_crawl: s?.lastCrawlTime ?? null,
            sitemaps: s?.sitemap ?? [], link: g.inspectionResultLink ?? null } : null },
          [...siteSide, ...googleSide], siteSide.length > 0);
      }
      const smProblems = [...sitemapProblems(sitemapInfo), ...(sitemap ? [] : ['our /sitemap.xml could not be read'])];
      record('sitemap:' + SITEMAP, { site: { readable: !!sitemap, urls: sitemap ? sitemap.size : null }, google: sitemapInfo }, smProblems, false);

      if (googleError) {
        const { data: recentRuns } = await service.from('kingdom_search_runs').select('status').order('id', { ascending: false }).limit(30);
        let down = 1; for (const r of recentRuns || []) { if (r.status === 'google_unavailable' || r.status === 'failed') down++; else break; }
        if (down === 3 || (down > 3 && (down - 3) % REMIND_DAYS === 0)) alerts.push(`Search Console could not be reached for ${down} daily checks in a row: ${googleError}`);
      }

      const { error: saveError } = await service.from('kingdom_search_status').upsert(rows, { onConflict: 'url' });
      if (saveError) throw new Error('Could not save results: ' + saveError.message);
      const live = new Set(rows.map(r => r.url));
      const gone = [...prev.keys()].filter(u => !live.has(u));
      if (gone.length) await service.from('kingdom_search_status').delete().in('url', gone);

      if (alerts.length) {
        await service.rpc('notify_operator_alert', { p_event: 'Admin Alert: System Health', p_properties: {
          summary: `The Memorabilia Kingdom search check found ${alerts.length} thing(s) that need attention.`,
          reference: 'kingdom search check', detail: alerts.join(' | ').slice(0, 3000) } });
      }
      const status = googleError ? 'google_unavailable' : rows.some(r => r.problem) ? 'attention' : 'ok';
      await service.from('kingdom_search_runs').insert({ status, checked: pages.length, sitemap: sitemapInfo, note: googleError || (alerts.length ? alerts.join(' | ').slice(0, 1000) : null) });
      return Response.json({ status, checked: pages.length, alerted: alerts.length, sitemap: sitemapInfo, google_error: googleError,
        pages: rows.filter(r => !r.url.startsWith('sitemap:')).map(r => ({ url: r.url, problem: r.problem, google: r.google, site: r.site })) });
    } catch (err) {
      console.error('kingdom-search-check failed:', err.message);
      await service.from('kingdom_search_runs').insert({ status: 'failed', note: String(err.message).slice(0, 500) }).then(() => {}, () => {});
      // 200 on purpose: the system health check would otherwise send a second, vaguer email about the same thing.
      return Response.json({ status: 'failed', error: String(err.message) });
    }
  };
}
