// Credabilia's existing product ratings, not independently measured probabilities.
export const ISSUERS = [
  { id:'psa', name:'PSA/DNA', rating:95, aliases:['PSA','PSA DNA','PSA/DNA Authentication Services','PSA DNA Authentication Services'], lookup:'https://www.psacard.com/cert' },
  { id:'jsa', name:'JSA', rating:92, aliases:['James Spence Authentication'], lookup:'https://www.spenceloa.com/verify-authenticity' },
  { id:'bas', name:'Beckett (BAS)', rating:93, aliases:['BAS','Beckett','Beckett Authentication','Beckett Authentication Services','Beckett Authentication Services (BAS)'], lookup:'https://www.beckett-authentication.com/verify-certificate', outage:true },
  { id:'sgc', name:'SGC', rating:90, aliases:[], lookup:null },
  { id:'cgc', name:'CGC', rating:91, aliases:[], lookup:null },
  { id:'uda', name:'Upper Deck Authenticated', rating:88, aliases:[], lookup:null },
  { id:'fanatics', name:'Fanatics Authentic', rating:87, aliases:[], lookup:null },
  { id:'steiner', name:'Steiner Sports', rating:85, aliases:[], lookup:null },
  { id:'tristar', name:'TriStar Productions', rating:84, aliases:[], lookup:'https://www.tristarauthentic.com/' },
  { id:'mlb', name:'MLB Authenticated', rating:89, aliases:[], lookup:null },
  // Fiterman Sports does not put certificate numbers on its items, so there is no record a buyer can look up. It is scored lower for that
  // reason; the score says nothing about whether the item is authentic.
  { id:'fiterman', name:'Fiterman Sports', rating:50, aliases:['Fiterman','Fiterman Sports Collectibles'], lookup:null, noNumber:true },
  { id:'other', name:'Other', rating:50, aliases:[], lookup:null },
];
// Issuers whose certificate numbers can be searched in Credabilia's own records (see the /certificate page).
export const LOOKUP_ISSUERS = ISSUERS.filter(issuer => !issuer.noNumber && issuer.id !== 'other');
// An issuer whose own lookup is down (flagged with outage:true above) cannot be checked, which holds scores down through no fault of the seller.
// The note explains that, and that scores rise once the lookup is back and the numbers are checked. Remove the flag when the lookup works again.
export const OUTAGE_NOTE = "Beckett's online certificate lookup is currently down, so we can't check Beckett certificate numbers right now. That is why items with Beckett certificates score lower at the moment. Copy the number and search it yourself once Beckett's site is back. When it is, we will check these numbers and the scores will go up.";
export function resolveIssuer(value) {
  const text = String(value || '').trim().toLowerCase();
  return ISSUERS.find(issuer => [issuer.id,issuer.name,...issuer.aliases].some(name=>name.toLowerCase()===text)) || null;
}
export function certificateInput(input={}) {
  const rawIssuer = String(input.certificate_issuer || '').trim();
  const number = String(input.certificate_number || '').trim();
  const custom = String(input.certificate_company || '').trim();
  if (!rawIssuer && !number && !custom) return { certificate_issuer:null, certificate_number:null, certificate_company:null };
  const issuer = resolveIssuer(rawIssuer);
  if (!issuer) throw new Error('Choose the certificate issuer.');
  if (issuer.noNumber) return { certificate_issuer:issuer.id, certificate_number:null, certificate_company:null };
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$/.test(number)) throw new Error('Enter the certificate number as printed (up to 80 characters).');
  if (issuer.id === 'other' && (custom.length<2 || custom.length>100)) throw new Error('Enter the issuing company name (2–100 characters).');
  return { certificate_issuer:issuer.id, certificate_number:number, certificate_company:issuer.id==='other'?custom:null };
}
// Treat any future AI output as a suggestion. Never accept its URL or rating.
export function certificateSuggestion(aiOutput={}) {
  const issuer=resolveIssuer(aiOutput.issuer);
  return { certificate_issuer:issuer?.id || 'other', certificate_company:issuer ? '' : String(aiOutput.issuer || '').slice(0,100), certificate_number:String(aiOutput.certificate_number || '').slice(0,80) };
}
