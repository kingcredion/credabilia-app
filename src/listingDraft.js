const DRAFT_KEY = 'credabilia-listing-draft';
const FORM_FIELDS = ['title', 'description', 'price', 'evidence', 'tags', 'weight_oz', 'length_in', 'width_in', 'height_in'];

// Saves everything needed to resume an in-progress listing after an accidental close, so the
// seller doesn't have to re-upload a photo or re-run (and re-pay for) AI drafting/background
// removal. Only each photo's path+kind is kept -- signed URLs expire in an hour, so resuming
// re-signs them fresh via service.signMediaUrls() rather than trusting a stored token.
export function saveListingDraft({ media, listingCategory, listingType, notes, certificate, signatureAi, form }) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      media: media.map(({ path, kind }) => ({ path, kind })),
      listingCategory, listingType, notes, certificate, signatureAi, form,
    }));
  } catch {}
}
export function loadListingDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}
export function clearListingDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
// Reads the plain (non-category-conditional) uncontrolled fields plus every attribute:* input
// present for the current category -- the same shape saveListingDraft's `form` expects, and the
// same shape the resume effect writes back with.
export function readFormValues(form) {
  if (!form) return {};
  const values = {};
  for (const field of FORM_FIELDS) values[field] = form.elements.namedItem(field)?.value || '';
  values.free_shipping = !!form.elements.namedItem('free_shipping')?.checked;
  values.attributes = {};
  for (const el of form.elements) { if (el.name?.startsWith('attribute:')) values.attributes[el.name.slice(10)] = el.value; }
  return values;
}
