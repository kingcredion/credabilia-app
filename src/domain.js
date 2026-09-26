import { listingDetails } from './listingDetails.js';
import { certificateInput } from './certificates.js';
export const WORKSPACES = ['collector', 'seller', 'auditor', 'messages'];
export const CATEGORIES = ['Sports', 'Comics', 'Art', 'Entertainment', 'History'];
export const VERDICTS = ['authentic', 'uncertain', 'concerns'];
export const DEMO_USER = { id: '11111111-1111-4111-8111-111111111111', display_name: 'Alex Morgan', can_sell: true, can_audit: true };

export function listingInput(input) {
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const evidence = String(input.evidence || '').trim();
  if (title.length < 4 || title.length > 120) throw new Error('Use a title between 4 and 120 characters.');
  if (description.length < 20 || description.length > 4000) throw new Error('Describe the item in 20–4,000 characters.');
  if (evidence.length > 2000) throw new Error('Evidence notes must be under 2,000 characters.');
  if (!CATEGORIES.includes(input.category)) throw new Error('Choose a category.');
  if (!Number.isSafeInteger(input.price_cents) || input.price_cents < 100 || input.price_cents > 100000000) throw new Error('Enter a price between $1 and $1,000,000.');
  const weight_oz = Number(input.weight_oz), length_in = Number(input.length_in), width_in = Number(input.width_in), height_in = Number(input.height_in);
  if (![weight_oz, length_in, width_in, height_in].every(n => Number.isFinite(n) && n > 0)) throw new Error('Enter a valid package weight and size, so buyers can see a real shipping cost.');
  const pickup_enabled = !!input.pickup_enabled;
  if (pickup_enabled && !input.pickup_station_id) throw new Error('Choose a pickup location.');
  return { title, description, evidence, category: input.category, price_cents: input.price_cents, weight_oz, length_in, width_in, height_in, free_shipping: !!input.free_shipping, pickup_enabled, pickup_station_id: pickup_enabled ? input.pickup_station_id : null, ...certificateInput(input), ...listingDetails(input, input.category) };
}

export function auditInput(input) {
  if (!VERDICTS.includes(input.verdict)) throw new Error('Choose an assessment.');
  const explanation = String(input.explanation || '').trim();
  if (explanation.length < 20 || explanation.length > 2000) throw new Error('Explain the evidence in 20–2,000 characters.');
  return { verdict: input.verdict, explanation };
}

export function priceInCents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Use a price with up to two decimal places.');
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function sampleListings() {
  return [
    { id: 'sample-1', title: '1968 Heritage baseball', category: 'Sports', price_cents: 18500, artwork: 'baseball', description: 'A vintage-style baseball with a handwritten signature. A study example for examining ink, surface wear, and provenance.', evidence: 'Sample only. No certificate or verified provenance supplied. Look for evidence before drawing a conclusion.' },
    { id: 'sample-2', title: 'The Astral Explorer · No. 1', category: 'Comics', price_cents: 7200, artwork: 'comic', description: 'A fictional first-issue comic with a bright illustrated cover. Practice checking print details, corners, and restoration clues.', evidence: 'Sample only. No professional grade. Cover illustration is a placeholder, not a scan of a real collectible.' },
    { id: 'sample-3', title: 'Coastal Forms · artist study', category: 'Art', price_cents: 24000, artwork: 'art', description: 'An abstract coastal composition for exploring the difference between an original artwork, a print, and a reproduction.', evidence: 'Sample only. Artist identity, medium, and edition remain unverified.' },
  ].map((item, i) => ({ ...item, seller_id: `sample-seller-${i}`, seller_name: ['Northfield Collection', 'Orbit Archive', 'Studio Seventeen'][i], status: 'active', created_at: '2026-09-10T09:00:00Z', audit_count: 0, sample: true }));
}
