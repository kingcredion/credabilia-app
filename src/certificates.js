// Credabilia's existing product ratings, not independently measured probabilities.
export const ISSUERS = [
  { id:'psa', name:'PSA/DNA', rating:95, aliases:['PSA','PSA DNA','PSA/DNA Authentication Services','PSA DNA Authentication Services'], lookup:'https://www.psacard.com/cert' },
  { id:'jsa', name:'JSA', rating:92, aliases:['James Spence Authentication'], lookup:'https://www.spenceloa.com/verify-authenticity' },
  { id:'bas', name:'Beckett (BAS)', rating:93, aliases:['BAS','Beckett','Beckett Authentication','Beckett Authentication Services','Beckett Authentication Services (BAS)'], lookup:'https://www.beckett-authentication.com/verify-certificate' },
  { id:'sgc', name:'SGC', rating:90, aliases:[], lookup:null },
  { id:'cgc', name:'CGC', rating:91, aliases:[], lookup:null },
  { id:'uda', name:'Upper Deck Authenticated', rating:88, aliases:[], lookup:null },
  { id:'fanatics', name:'Fanatics Authentic', rating:87, aliases:[], lookup:null },
  { id:'steiner', name:'Steiner Sports', rating:85, aliases:[], lookup:null },
  { id:'tristar', name:'TriStar Productions', rating:84, aliases:[], lookup:'https://www.tristarauthentic.com/' },
  { id:'mlb', name:'MLB Authenticated', rating:89, aliases:[], lookup:null },
  // Fiterman Sports does not put certificate numbers on its items, so there is no record a buyer can look up. It is scored lower for that
  // reason; the score says nothing about whether the item is authentic.
  { id:'fiterman', name:'Fiterman Sports', rating:55, aliases:['Fiterman','Fiterman Sports Collectibles'], lookup:null, noNumber:true, website:'https://www.fitermansports.com',
    // Plain facts, the company's own claims marked as such, and the reasoning for the rating. Reviewed 2026-10-17.
    profile: {
      summary: 'A Houston-area sports memorabilia and marketing company led by CEO Ryan Fiterman, with a store in League City, Texas. It runs autograph signings and events, custom framing and talent management. By its own account it has been in the business for more than 20 years.',
      looked: [
        'Its website and press releases: named leadership, a store address, and a list of the athletes it works with.',
        "Public partnerships: WWE named it an official autograph partner in 2022 (WWE's own announcement), and a 2014 press release announced an exclusive autograph partnership with Mike Tyson. We could not confirm the Tyson arrangement is still in place.",
        'Customer reviews, which are mixed. The Better Business Bureau lists it as Not Rated, with no complaints on file. Review sites include praise, and also complaints about customer service, shipping and certificates that did not arrive.',
        "What it says about authenticity: \"All our items are guaranteed to feature authentic signatures.\" This is the company's own statement.",
      ],
      couldnt: [
        'Nothing it issues carries a number we can look up, and there is no public lookup, so we cannot check an item against any record.',
        'Its website does not describe how its holograms, certificates or signings are verified.',
        'There is no independent second opinion on items it authenticates itself. Some of its items also carry a JSA or Beckett certificate; those are rated separately when listed.',
      ],
      why: 'Fiterman Sports is rated 55 out of 100. That is above an issuer we know nothing about (50), because it is an established company with public partnerships, including WWE. It is below Frameworth (65) and the issuers whose numbers we can check (84 to 95), because we cannot check its items against any record, its process is not published, and customer reviews are mixed. The rating is not a verdict on any single item.',
    } },
  // Frameworth Sports Marketing (Toronto, since 1992) makes framed signed memorabilia and issues its own hologram and certificate. It has no public lookup, so a
  // number cannot be checked against its records; the rating (65) already reflects that, so its numbers count in full and are not reduced again to 75%.
  { id:'frameworth', name:'Frameworth Sports Marketing', rating:65, aliases:['Frameworth','Frameworth Sports','Frameworth Sports Canada'], lookup:null, noLookup:true, website:'https://frameworth.com', authenticityPage:'https://frameworth.com/pages/authenticity',
    // What a buyer is told on the item page about who the issuer is and how Credabilia arrived at the rating. Plain facts and the company's own claims, marked as such.
    profile: {
      summary: 'A Toronto company that has made framed sports memorabilia, mostly hockey, since 1992. It sells through its own website and through retailers such as Best Buy Canada.',
      looked: [
        "Frameworth's own website: its Toronto address, its 1992 start, and its authenticity page.",
        'How its products are sold: its signed pieces appear at established retailers, not only on its own site.',
        "What it says about its process: each signed piece comes with a hologram and a certificate of authenticity, most signings are done directly with the athletes, and when they are not it buys only from licensed dealers or the player's agent. These are the company's own statements.",
      ],
      couldnt: [
        'It has no public lookup, so Credabilia cannot check a certificate number against its records.',
        'It makes the item and issues the certificate itself, so there is no independent second opinion.',
        'Open-edition certificate numbers are often product codes shared by many copies, so a number alone does not identify one piece.',
      ],
      why: 'Frameworth is rated 65 out of 100. That is well above an issuer we know nothing about (50), because it is an established company with a public process. It is below issuers whose numbers we can check (84 to 95), only because we cannot check this one. The rating is not a verdict on any single item.',
    } },
  { id:'other', name:'Other', rating:50, aliases:[], lookup:null },
];
// Issuers whose certificate numbers can be searched in Credabilia's own records (see the /certificate page).
export const LOOKUP_ISSUERS = ISSUERS.filter(issuer => !issuer.noNumber && !issuer.noLookup && issuer.id !== 'other');
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
