// Microsoft Clarity: free session recordings and heatmaps, so we can see where people get stuck. Loaded only on the real
// sites (never localhost, previews or the native apps), and not for visitors whose time zone is in Europe, because Clarity
// needs a consent signal there and the site has no consent banner. A time zone is only an approximation of the country,
// so this errs towards not recording. Private areas (messages, support, the admin dashboard and address fields) carry
// data-clarity-mask="True" in the markup, and Clarity masks typed input everywhere by default.
export const CLARITY_PROJECT_ID = 'ysofrrayq2';

const REAL_SITE = /^(www\.)?credabilia\.(com|app)$/;
const EUROPE_LIKE_ZONES = /^(Europe\/|Atlantic\/(Azores|Canary|Faroe|Madeira|Reykjavik)$|Africa\/Ceuta$)/;

export function shouldStartClarity(hostname, timeZone) {
  if (!REAL_SITE.test(hostname || '')) return false;
  if (EUROPE_LIKE_ZONES.test(timeZone || '')) return false;
  return true;
}

export function startClarity() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined' || window.clarity) return false;
    let timeZone = '';
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* unknown zone: treated as not Europe */ }
    if (!shouldStartClarity(window.location.hostname, timeZone)) return false;
    // Clarity's standard loader snippet.
    (function (c, l, a, r, i) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      const t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      const y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
    return true;
  } catch { return false; }
}
