// Package weight is stored and quoted in ounces. Once it reaches a pound, show the pounds-and-ounces equivalent
// so a seller who types 90 sees "5 lb 10 oz" and can tell it is the weight they meant.
export function formatWeight(ounces) {
  const total = Number(ounces);
  if (!Number.isFinite(total) || total < 16) return '';
  const rounded = Math.round(total * 10) / 10;
  let pounds = Math.floor(rounded / 16);
  let rest = Math.round((rounded - pounds * 16) * 10) / 10;
  if (rest >= 16) { pounds += 1; rest = 0; }
  return rest === 0 ? `${pounds} lb` : `${pounds} lb ${rest} oz`;
}
