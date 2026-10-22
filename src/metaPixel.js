import { EUROPE_LIKE_ZONES } from './clarity.js';

// Meta (Instagram and Facebook) pixel, so an ad on Instagram can count the people who then ask for a Founding invitation or sign up, and learn who else
// is likely to. Loaded only on the real sites (never localhost, previews or the phone apps); not for visitors whose time zone is in Europe, because the
// site has no consent banner there; and not for anyone whose browser sends the Global Privacy Control opt-out signal. It sends Meta the page views and two
// standard events (Lead, CompleteRegistration) and nothing else: no name, email, price or listing detail is ever passed.
//
// The pixel ID is a public number (it is visible in the page of any site that uses a pixel), copied from Meta Events Manager. While it is empty, nothing loads.
export const META_PIXEL_ID = '';

const REAL_SITE = /^(www\.)?credabilia\.(com|app)$/;

export function shouldStartMetaPixel({ pixelId, hostname, timeZone, globalPrivacyControl } = {}) {
  if (!/^\d{8,20}$/.test(String(pixelId || ''))) return false;
  if (!REAL_SITE.test(hostname || '')) return false;
  if (EUROPE_LIKE_ZONES.test(timeZone || '')) return false;
  if (globalPrivacyControl === true) return false;
  return true;
}

// Our event names, and the standard Meta event each one counts as. Anything not listed here is never sent to Meta.
export const META_EVENTS = { founding_request: 'Lead', sign_up: 'CompleteRegistration' };

export function startMetaPixel(pixelId = META_PIXEL_ID, zoneOverride) {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined' || window.fbq) return false;
    let timeZone = zoneOverride ?? '';
    if (zoneOverride === undefined) { try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* unknown zone: treated as not Europe */ } }
    if (!shouldStartMetaPixel({ pixelId, hostname: window.location.hostname, timeZone, globalPrivacyControl: globalThis.navigator?.globalPrivacyControl })) return false;
    // Meta's standard loader snippet.
    (function (f, b, e, v) {
      const n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      const t = b.createElement(e); t.async = true; t.src = v;
      const s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    return true;
  } catch { return false; }
}

// Called from trackEvent, which already limits everything to the real sites. A no-op unless the pixel actually started.
export function trackMeta(name) {
  try {
    const standard = META_EVENTS[name];
    if (!standard || typeof window === 'undefined' || typeof window.fbq !== 'function') return false;
    window.fbq('track', standard);
    return true;
  } catch { return false; }
}
