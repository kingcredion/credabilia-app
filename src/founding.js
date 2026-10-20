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
  'The Founding 100 is an invitation-only program for sellers we contacted directly. An invitation is tied to one email address and can be claimed once, by signing in with that address and verifying it, until the date shown on the claim page or until all 100 spots are taken, whichever comes first.',
  'A Founding seller pays no Credabilia selling fee on their sales for as long as their account stays open and in good standing. The benefit belongs to that account and cannot be transferred or sold. It does not cover payment-processing charges, which are shown separately on each sale, or shipping, insurance or taxes.',
  'We may end the benefit for an account that is closed, or that breaks our rules, for example by listing items on behalf of other sellers to avoid fees. Unclaimed invitations, and the contact details kept for them, are deleted when the window closes.',
];

// Apple's "Hide My Email" gives an app a random forwarding address, which can never match an invitation sent to the person's real address.
export const isAppleRelayEmail = email => /@privaterelay\.appleid\.com$/i.test(String(email || '').trim());

// Shown on the claim page and repeated in the invitation email and call script, so nobody is surprised.
export const SAME_EMAIL_NOTE = 'Use the exact email address we contacted. Signing in with a different address, or with Apple’s "Hide My Email", will not work, because your invitation is matched to your email address.';
