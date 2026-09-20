export const DETAIL_FIELDS = {
  item_type: 'Item type', subject: 'Person, character or subject', year: 'Year', condition: 'Condition notes',
  sport: 'Sport', team: 'Team', artist: 'Artist', medium: 'Medium', dimensions: 'Dimensions',
  publisher: 'Publisher', issue: 'Issue or edition', grading_company: 'Grading company', grade: 'Grade',
};
export function detailKeys(category) {
  return ['item_type', 'subject', 'year', 'condition', ...(category === 'Sports' ? ['sport', 'team'] : category === 'Art' ? ['artist', 'medium', 'dimensions'] : category === 'Comics' ? ['publisher', 'issue'] : []), 'grading_company', 'grade'];
}
export function listingDetails(input = {}, category) {
  const source = input.attributes ?? {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Check the item details.');
  const attributes = {};
  for (const [key, value] of Object.entries(source)) {
    if (!detailKeys(category).includes(key) || typeof value !== 'string') throw new Error('Unsupported item detail.');
    const clean = value.trim();
    if (clean.length > 120) throw new Error('Keep each item detail under 120 characters.');
    if (clean) attributes[key] = clean;
  }
  const rawTags = typeof input.tags === 'string' ? input.tags.split(',') : input.tags ?? [];
  if (!Array.isArray(rawTags) || rawTags.some(tag => typeof tag !== 'string')) throw new Error('Use comma-separated search tags.');
  const tags = [...new Set(rawTags.map(tag => tag.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))];
  if (tags.length > 8 || tags.some(tag => tag.length > 40)) throw new Error('Use up to eight tags, each under 40 characters.');
  return { attributes, tags };
}
export function listingMatches(item, query) {
  return [item.title, item.description, ...Object.values(item.attributes || {}), ...(item.tags || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase());
}
