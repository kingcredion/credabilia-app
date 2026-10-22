// Founding 100: the wording and the small decisions the pages share. The program itself (who qualifies, the 90-day window, the 100-spot cap, the fee
// exemption) lives in the database; nothing here decides anything about money. The hero badge is only a picture of a status the server already holds.
export const FOUNDING_BADGE = {
  src: '/brand/founding-100-badge-v2.webp',
  srcSet: '/brand/founding-100-badge-v2-460.webp 460w, /brand/founding-100-badge-v2.webp 920w',
  width: 920,
  height: 307,
  alt: 'Founding 100: lifetime privileges',
};

// Shown under the badge, word for word.
export const FOUNDING_FEE_NOTE = 'Your Credabilia selling fees are waived for the lifetime of the platform. Payment-processing fees still apply.';

// Who sees the Founding badge in the hero: a signed-in member whose account the server says holds a spot. Everyone else keeps the existing badge.
export const showFoundingBadge = (session, status) => !!session && status?.member === true;

// What the claim page should say for a signed-in person, from founding_status().
export function claimView(status) {
  if (!status) return 'loading';
  if (status.member) return 'member';
  if (!status.open) return 'closed';
  return status.invited ? 'invited' : 'not-invited';
}

export const FOUNDING_TERMS = [
  'The Founding 100 is an invitation-only program. Invitations go to sellers we contact directly, and anyone who visits the Founding page can also ask to be considered. Asking does not guarantee an invitation: we review each request by hand and may approve or decline it. An invitation is tied to one email address and can be claimed once, by signing in with that address and verifying it, until the date shown on the claim page or until all 100 spots are taken, whichever comes first.',
  'A Founding seller pays no Credabilia selling fee on their sales for as long as their account stays open and in good standing. The benefit belongs to that account and cannot be transferred or sold. It does not cover payment-processing charges, which are shown separately on each sale, or shipping, insurance or taxes.',
  'We may end the benefit for an account that is closed, or that breaks our rules, for example by listing items on behalf of other sellers to avoid fees. Unclaimed invitations and requests, and the contact details kept for them, are deleted when the window closes.',
];

// A short plain label for where a request came from, read from the link's own utm_source and utm_campaign (a link from Instagram that only carries
// Meta's fbclid counts as "meta"). Never anything about the person; the database also strips it down to letters, digits and . _ / -.
export function requestSource(search) {
  try {
    const q = new URLSearchParams(String(search || ''));
    const label = [q.get('utm_source'), q.get('utm_campaign')].map(v => String(v || '').trim()).filter(Boolean).join('/');
    if (label) return label.slice(0, 100);
    return q.get('fbclid') ? 'meta' : '';
  } catch { return ''; }
}

// The email staff send after approving a request: where to claim, and which address to use. Approving does not email the person by itself.
export function approvalMailto(request) {
  const first = String(request.contact_name || '').trim().split(/\s+/)[0] || 'there';
  const body = `Hi ${first},\n\nThanks for asking to join the Credabilia Founding 100. I've approved your request.\n\nTo claim your spot, go to credabilia.com/founding and sign in with this same email address (${request.email}). A different address, or Apple's "Hide My Email", will not work.\n\nFounding sellers pay no Credabilia selling fees for as long as their account stays open and in good standing. Stripe's normal payment-processing fees still apply.\n\nDavid Ortiz\nFounder, Credabilia LLC`;
  return `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent('Your Credabilia Founding seller invitation')}&body=${encodeURIComponent(body)}`;
}

// Apple's "Hide My Email" gives an app a random forwarding address, which can never match an invitation sent to the person's real address.
export const isAppleRelayEmail = email => /@privaterelay\.appleid\.com$/i.test(String(email || '').trim());

// Shown on the claim page and repeated in the invitation email and call script, so nobody is surprised.
export const SAME_EMAIL_NOTE = 'Use the exact email address we contacted. Signing in with a different address, or with Apple’s "Hide My Email", will not work, because your invitation is matched to your email address.';
