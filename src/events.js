import { track } from '@vercel/analytics';
import { trackMeta } from './metaPixel.js';

// Funnel events for Vercel Web Analytics (and Microsoft Clarity, when it is running), so we can see where people drop off:
// sign_up, listing_published, payout_setup_started, request_to_buy. Real sites only, never localhost, previews or the native apps.
// Properties are plain labels (a category, a sale type, a sign-in provider). Never an email, a name, a price or an id.
// sign_up is reported from trackSignUpIfNew in analytics.js, which already decides who is a new member.
export const FUNNEL_EVENTS = ['sign_up', 'listing_published', 'payout_setup_started', 'request_to_buy', 'founding_request'];
const REAL_SITE = /^(www\.)?credabilia\.(com|app)$/;

export function trackEvent(name, props) {
  try {
    if (!FUNNEL_EVENTS.includes(name)) return false;
    if (typeof window === 'undefined' || !REAL_SITE.test(window.location.hostname)) return false;
    track(name, props);
    if (typeof window.clarity === 'function') window.clarity('event', name);
    trackMeta(name);
    return true;
  } catch { return false; }
}
