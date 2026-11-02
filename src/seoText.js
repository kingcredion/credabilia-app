import { ISSUERS } from './certificates.js';

// Search-result text for a listing, shared by the crawler layer (middleware.js) and the app itself, so the title and description a visitor's browser carries are the same
// ones a search engine is given.
export const SITE_NAME = 'Credabilia';
const money = cents => (typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '');

// Cut at a word boundary so a description never ends mid-word.
export function shorten(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s,.;:–—-]+$/, '') + '…';
}

export const issuerName = item => {
  if (!item.certificate_issuer) return null;
  if (item.certificate_issuer === 'other') return item.certificate_company || null;
  return ISSUERS.find(i => i.id === item.certificate_issuer)?.name || null;
};

// Title, description and image text derived from real listing data. Nothing is invented: a missing field is simply left out, authentication is never claimed (a certificate is
// described as "listed" with its issuer), and the giveaway prize says plainly that it is not for sale.
export function listingSeo(item) {
  const attrs = item.attributes || {};
  const subject = typeof attrs.subject === 'string' ? attrs.subject.trim() : '';
  const base = subject && !item.title.toLowerCase().includes(subject.toLowerCase()) ? `${item.title} – ${subject}` : item.title;
  const title = `${shorten(base, 62)} | ${SITE_NAME}`;
  const cert = issuerName(item);
  let description;
  if (item.giveaway_prize) {
    description = shorten(`${item.title} is the prize in the Credabilia giveaway. Not for sale. See the official rules and how to enter free.`, 155);
  } else {
    const facts = [attrs.sport, attrs.team, attrs.year].filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).join(' · ');
    const parts = [`Explore ${item.title} on ${SITE_NAME}.`, money(item.price_cents) && `${item.listing_type === 'auction' ? 'Current price' : 'Price'} ${money(item.price_cents)}.`, facts && facts + '.', cert && item.certificate_has_number ? `${cert} certificate number listed.` : '', item.description];
    description = shorten(parts.filter(Boolean).join(' '), 155);
  }
  const alt = [item.title, subject && !item.title.toLowerCase().includes(subject.toLowerCase()) ? subject : '', item.category ? `${item.category} memorabilia` : ''].filter(Boolean).join(' – ');
  return { title, description, alt };
}


export const HOME_DESCRIPTION = 'Credabilia is The Memorabilia Kingdom: buy and sell collectibles, explore certificate details, and collect with confidence.';
export const STATIC_PAGES = {
  help: { title: 'Help Center | Credabilia', description: 'Answers about buying, selling, shipping, payment protection, certificates and community audits on Credabilia.', heading: 'Credabilia Help Center', text: 'Answers about buying, selling, shipping, how your payment is held until delivery, certificates of authenticity and community audits.' },
  terms: { title: 'Terms of Service | Credabilia', description: 'The terms for buying and selling on Credabilia, including payment holds, refunds, shipping and certificates.', heading: 'Credabilia Terms of Service', text: 'The terms for buying and selling on Credabilia, including how payments are held until delivery, refunds, shipping and certificates.' },
  privacy: { title: 'Privacy Policy | Credabilia', description: 'How Credabilia collects, uses and protects your information.', heading: 'Credabilia Privacy Policy', text: 'How Credabilia collects, uses and protects your information.' },
  certificate: { title: 'Certificate lookup | Credabilia', description: 'Search a certificate number from PSA/DNA, JSA, Beckett (BAS) and other issuers to see whether it appears on a Credabilia listing.', heading: 'Certificate lookup', text: 'Search a certificate number from PSA/DNA, JSA, Beckett (BAS) and other issuers to see whether it appears on a Credabilia listing.' },
  'giveaway-rules': { title: 'Giveaway Official Rules | Credabilia', description: 'Official rules for the Credabilia giveaway: no purchase necessary, how to enter, how tickets and odds work, eligibility and how the winner is chosen.', heading: 'Credabilia Giveaway Official Rules', text: 'Official rules for the Credabilia giveaway. No purchase necessary. Includes how to enter, free email entry, how tickets and odds work, eligibility, the prize and how the winner is chosen.' },
  // The invitation screen stays out of search (noindex, nofollow, and robots.txt) exactly as before; it exists here so a shared link gets a normal 200 preview instead of a 404.
  founding: { title: 'Founding 100 | Credabilia', description: 'Founding 100 is a group of 100 sellers who pay no Credabilia selling fees for as long as their account stays open and in good standing.', heading: 'Founding 100', text: 'Founding 100 is a group of 100 sellers who pay no Credabilia selling fees for as long as their account stays open and in good standing. Payment-processing fees still apply.', robots: 'noindex, nofollow' },
  sell: { title: 'Sell your memorabilia | Credabilia', description: 'List signed memorabilia and collectibles on Credabilia. Get paid through Stripe after delivery, with item credibility scores that help buyers trust your listing.', heading: 'Sell your memorabilia on Credabilia', text: 'List signed memorabilia and collectibles. You are paid through Stripe after delivery, and item credibility scores help buyers trust your listing.' },
};
export const CATEGORY_INTRO = {
  Sports: 'Signed jerseys, balls, helmets, gloves, trading cards and other sports memorabilia, listed by collectors and sellers.',
  Comics: 'Comic books, graded issues, signed covers and related collectibles, listed by collectors and sellers.',
  Art: 'Original and signed artwork, prints and framed pieces, listed by collectors and sellers.',
  Entertainment: 'Movie, television and music memorabilia, props and signed pieces, listed by collectors and sellers.',
  History: 'Historical documents, artifacts and signed pieces, listed by collectors and sellers.',
};

export const categoryDescription = (name, count) => count
  ? `Browse ${count} ${name.toLowerCase()} memorabilia and collectible listing${count === 1 ? '' : 's'} on ${SITE_NAME}, with photos, prices and seller storefronts.`
  : `${name} memorabilia and collectibles on ${SITE_NAME}. ${CATEGORY_INTRO[name]}`;
