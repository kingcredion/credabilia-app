// Package weight is stored and quoted in ounces. Once it reaches a pound, show the pounds-and-ounces equivalent
// so a seller who types 90 sees "5 lb 10 oz" and can tell it is the weight they meant.
// Package size is stored and quoted in inches; from a foot up, show feet and inches (30 -> "2 ft 6 in").
export function formatLength(inches) {
  const total = Number(inches);
  if (!Number.isFinite(total) || total < 12) return '';
  const rounded = Math.round(total * 10) / 10;
  let feet = Math.floor(rounded / 12);
  let rest = Math.round((rounded - feet * 12) * 10) / 10;
  if (rest >= 12) { feet += 1; rest = 0; }
  return rest === 0 ? `${feet} ft` : `${feet} ft ${rest} in`;
}

export function formatWeight(ounces) {
  const total = Number(ounces);
  if (!Number.isFinite(total) || total < 16) return '';
  const rounded = Math.round(total * 10) / 10;
  let pounds = Math.floor(rounded / 16);
  let rest = Math.round((rounded - pounds * 16) * 10) / 10;
  if (rest >= 16) { pounds += 1; rest = 0; }
  return rest === 0 ? `${pounds} lb` : `${pounds} lb ${rest} oz`;
}
