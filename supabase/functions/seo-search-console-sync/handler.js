// Called daily by pg_cron (202610170153_seo_sync_schedule.sql) via pg_net, authenticated with the real service role key as a Supabase-issued JWT.
//
// Copies the last few days of Google Search Console search data (day, page, search, clicks, views, average position) into the database, where
// admin_seo_report() reads it. Read-only toward Google: it only asks for data, with the read-only Search Console scope.
// It signs in to Google one of two ways. (1) With the owner's own Google login, saved once as an OAuth refresh token: the secrets
// GOOGLE_SC_CLIENT_ID, GOOGLE_SC_CLIENT_SECRET and GOOGLE_SC_REFRESH_TOKEN. (2) With a service account key in GOOGLE_SC_SERVICE_ACCOUNT_JSON (some Google
// organizations forbid creating those keys). Until one of them exists the function does nothing but record "not configured", so the schedule can
// run safely before setup is finished.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const ROW_LIMIT = 5000, MAX_ROWS = 25000, CHUNK = 1000;
const DAYS_BACK_START = 6, DAYS_BACK_END = 2, MAX_CATCH_UP_DAYS = 120; // Google's figures for a day settle about two days later, so re-read the last several days each run.

const b64url = input => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const pemToDer = pem => Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
const isoDay = date => date.toISOString().slice(0, 10);

async function accessToken(account, fetchFn, nowSeconds) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3000 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claims));
  const response = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + claims + '.' + b64url(signature) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('Google sign-in failed: ' + (body.error_description || body.error || response.status));
  return body.access_token;
}

// Trades a saved refresh token for a short-lived access token (the owner's own login, read-only scope).
async function refreshAccessToken({ clientId, clientSecret, refreshToken }, fetchFn) {
  const response = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('Google sign-in failed: ' + (body.error_description || body.error || response.status));
  return body.access_token;
}

export function createHandler({ createClient, env, fetchFn = fetch, now = () => new Date() }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (body, status = 200) => Response.json(body, { status, headers: cors });
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const log = (status, rows, note) => service.rpc('seo_log_sync', { p_status: status, p_rows: rows, p_note: note }).then(() => {}, () => {});
    try {
      const login = { clientId: env('GOOGLE_SC_CLIENT_ID'), clientSecret: env('GOOGLE_SC_CLIENT_SECRET'), refreshToken: env('GOOGLE_SC_REFRESH_TOKEN') };
      const useLogin = !!(login.clientId && login.clientSecret && login.refreshToken);
      const raw = env('GOOGLE_SC_SERVICE_ACCOUNT_JSON');
      if (!useLogin && !raw) { await log('not_configured', 0, 'No Google access is saved yet (GOOGLE_SC_CLIENT_ID, GOOGLE_SC_CLIENT_SECRET and GOOGLE_SC_REFRESH_TOKEN, or GOOGLE_SC_SERVICE_ACCOUNT_JSON).'); return reply({ configured: false }); }
      let account;
      if (!useLogin) {
        try { account = JSON.parse(raw); } catch { throw new Error('The service account secret is not valid JSON.'); }
        if (!account.client_email || !account.private_key) throw new Error('The service account secret is missing client_email or private_key.');
      }
      const site = env('GOOGLE_SC_SITE') || 'sc-domain:credabilia.com';
      const today = now();
      // The daily run re-reads the last few days. A one-off catch-up can ask for longer ({"days": 60}) to fill in history.
      const asked = Number((await request.json().catch(() => ({}))).days);
      const backDays = Number.isFinite(asked) && asked > DAYS_BACK_START ? Math.min(Math.floor(asked), MAX_CATCH_UP_DAYS) : DAYS_BACK_START;
      const start = new Date(today.getTime() - backDays * 86400000), end = new Date(today.getTime() - DAYS_BACK_END * 86400000);
      const token = useLogin ? await refreshAccessToken(login, fetchFn) : await accessToken(account, fetchFn, Math.floor(today.getTime() / 1000));

      // Two reads. By phrase (Google hides rarely used phrases, so these rows undercount a small site), and by page alone (never hidden), saved with an
      // empty phrase so the report can take true totals from them.
      const rows = [];
      for (const dimensions of [['date', 'page', 'query'], ['date', 'page']]) {
        const byPage = dimensions.length === 2;
        for (let startRow = 0, got = 0; got < MAX_ROWS; startRow += ROW_LIMIT) {
          const response = await fetchFn('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query', {
            method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: isoDay(start), endDate: isoDay(end), dimensions, rowLimit: ROW_LIMIT, startRow }) });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error('Search Console said: ' + (body.error?.message || response.status));
          const page = body.rows || [];
          for (const row of page) rows.push({ day: row.keys[0], page: row.keys[1], query: byPage ? '' : row.keys[2], clicks: row.clicks, impressions: row.impressions, position: row.position });
          got += page.length;
          if (page.length < ROW_LIMIT) break;
        }
      }

      let saved = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data, error } = await service.rpc('seo_ingest_search_rows', { p_rows: rows.slice(i, i + CHUNK) });
        if (error) throw new Error('Could not save the rows: ' + error.message);
        saved += Number(data) || 0;
      }
      await log('ok', saved, isoDay(start) + ' to ' + isoDay(end));
      return reply({ configured: true, rows: saved });
    } catch (err) {
      console.error('seo-search-console-sync failed:', err.message);
      await log('failed', 0, err.message);
      return reply({ error: 'The Search Console sync failed.' }, 502);
    }
  };
}
