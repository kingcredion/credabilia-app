// Credabilia's existing product ratings, not independently measured probabilities.
export const ISSUERS = [
  { id:'psa', name:'PSA/DNA', rating:95, aliases:['PSA','PSA DNA','PSA/DNA Authentication Services','PSA DNA Authentication Services'], lookup:'https://www.psacard.com/cert', website:'https://www.psacard.com', authenticityPage:'https://www.psacard.com/services/autographauthentication',
    profile: {
      summary: "PSA/DNA is the autograph authentication service of PSA (Professional Sports Authenticator), based in Santa Ana, California. PSA says it has evaluated autographs since the late 1990s. PSA's parent company, Collectors, was bought by an investor group led by Nat Turner, D1 Capital Partners and Cohen Private Ventures in February 2021, and in December 2025 Collectors announced it would also acquire Beckett.",
      looked: [
        "PSA's own description of its process. For signatures already made, experts use ink analysis, signature-structure analysis, item evaluation and side-by-side comparisons, with a video spectral comparator when needed. PSA also offers an In-the-Presence service, in which a signing is witnessed and certified in real time. These are PSA's own statements.",
        "Its official certificate lookup, where you enter the full number printed on the label. It covers PSA/DNA autographs as well as graded cards, and shows the certificate number, the result, a description of the item and the signer.",
        "Its tamper-evident stickers, certificates of authenticity and letters of authenticity. PSA says older PSA/DNA labels stay valid even though the design has changed.",
        "Auction-house acceptance: Heritage Auctions has accepted PSA/DNA-authenticated autographs in its sports showcase auctions (announced 2021). That shows market acceptance, not an accuracy rate.",
      ],
      couldnt: [
        "PSA's website was behind a bot check for us, so we could not test the lookup ourselves.",
        "Certificate numbers have not had one format over the years, and we could not confirm which older autograph certificates have no online record.",
        "A matching number shows PSA issued it. It does not prove the item in your hands is the one that was certified, because counterfeit labels can reuse real numbers. Compare the item with the photo and description in the record.",
        "We found no independent measurement of how often its opinions are right.",
      ],
      why: "PSA/DNA is rated 95 out of 100, the highest we give. It is a long-established, widely accepted issuer with a public lookup. A seller-entered number counts at 75% of that until a Credabilia operator checks it with PSA.",
    } },
  { id:'jsa', name:'JSA', rating:92, aliases:['James Spence Authentication'], lookup:'https://www.spenceloa.com/verify-authenticity', website:'https://www.spenceloa.com', authenticityPage:'https://www.spenceloa.com/authentication',
    profile: {
      summary: "James Spence Authentication (JSA) was founded in 2005 by James Spence Jr., from a family of autograph collectors that goes back four generations. In March 2024 Certified Collectibles Group, the parent company of CGC, bought JSA. The Spence family continues to run it.",
      looked: [
        "JSA's own pages. It says every item is examined by its authenticators, each signature is compared with a large exemplar library, and the authenticators score the item together. Certified items get a registration number and a tamper-evident label, and items that fail are returned with a letter explaining why. It also says it uses a video spectral comparator when closer examination is needed. These are JSA's own statements.",
        "Its official verification page, where you look up a registration number.",
        "The size of its reference library: JSA's website once cited nearly 700,000 files, and the 2024 acquisition announcement cited nearly one million images. These are JSA's own figures.",
        "JSA's site also lists authorized dealers and events, and CGC and JSA offer a combined service for signed comics.",
      ],
      couldnt: [
        "We could not see what its lookup returns, because it needs a real number to be entered.",
        "A matching number shows JSA issued it, not that the item in your hands is the one it was issued for. Compare the label and the item.",
        "We found no independent measurement of how often its opinions are right.",
      ],
      why: "JSA is rated 92 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with JSA.",
    } },
  { id:'bas', name:'Beckett (BAS)', rating:93, aliases:['BAS','Beckett','Beckett Authentication','Beckett Authentication Services','Beckett Authentication Services (BAS)'], lookup:'https://bas.beckett.com/verify-certificate', website:'https://bas.beckett.com', authenticityPage:'https://bas.beckett.com/services/authentication',
    profile: {
      summary: "Beckett Authentication Services (BAS) is the autograph authentication business of Beckett, based in Plano, Texas. Beckett says BAS started in November 2016. In December 2025, Collectors, the parent company of PSA, announced it would acquire Beckett.",
      looked: [
        "Beckett's own description. For signatures already made, BAS gives an expert opinion based on signature analysis, comparison with exemplars, and tools such as a video spectral comparator. Its Witness Certification service has a Beckett representative watch the signing. These are Beckett's own statements.",
        "Its labels: an oval tamper-evident sticker with a matching alphanumeric certificate number, plus an optional letter of authenticity that includes a photo of the item. Beckett announced stickers with a hologram and a QR code in March 2021, so older stickers look different.",
        "Its official lookup for BAS certificates. It is separate from Beckett's card-grading lookup.",
        "Its own FAQ, which says a lookup can wrongly return \"no record found\" and tells customers to contact Beckett with the number, a description and a photo.",
      ],
      couldnt: [
        "Beckett's website was behind a bot check for us, so we could not test the lookup or see a result page.",
        "We could not confirm every certificate-number format Beckett has used.",
        "A matching number shows BAS issued it, not that the item in your hands is the one it was issued for. A missing record is a reason to ask Beckett, not proof of a fake.",
        "We found no independent measurement of how often its opinions are right.",
      ],
      why: "Beckett (BAS) is rated 93 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with Beckett.",
    } },
  { id:'sgc', name:'SGC', rating:90, aliases:[], lookup:'https://www.gosgc.com/cert-code-lookup', website:'https://www.gosgc.com',
    profile: {
      summary: "SGC, LLC is a certification company based in Boca Raton, Florida, best known for grading trading cards. It announced an autograph authentication service, SGC Authentic, in 2013.",
      looked: [
        "SGC's own certification lookup. It checks a cert code: seven digits on black labels, or eleven characters (XXXXXXX-XXX) on green and white labels.",
        "A 2013 report in Sports Collectors Digest about its autograph authentication service.",
        "A Baseball Hall of Fame shop listing that describes an SGC-authenticated item with a numbered certificate and a matching hologram on the back.",
      ],
      couldnt: [
        "SGC's website today is built around card grading. We could not confirm from it that SGC still authenticates autographs, or how an autograph certificate appears in the lookup.",
        "A matching cert code shows that SGC issued that code, not that the item in your hands is the one it was issued for. Compare the label, hologram and item.",
      ],
      why: "SGC is rated 90 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with SGC.",
    } },
  { id:'cgc', name:'CGC', rating:91, aliases:[], lookup:'https://www.cgcgrading.com/verify', website:'https://www.cgccomics.com', authenticityPage:'https://www.cgccomics.com/grading/cgc-guarantee/',
    profile: {
      summary: "CGC (Certified Guaranty Company) is based in Sarasota, Florida, and is part of Certified Collectibles Group, in which funds managed by Blackstone took a majority stake in 2021. It grades and certifies comics and other collectibles, and says it has offered witnessed signature certification, called Signature Series, since 2001.",
      looked: [
        "CGC's official verification page: choose the type of collectible and enter the number on the label. CGC says this confirms the description and grade in its database and helps show the holder is genuine and has not been tampered with.",
        "CGC's own guarantee, which treats signed items differently. On a yellow Signature Series label, where a CGC or JSA representative witnessed the signing, CGC guarantees the witnessed signature is authentic. On the black and yellow CGC and JSA Authentic Autograph label, for signatures made before submission, CGC states that the authenticity of the unwitnessed signature is not guaranteed. A green qualified label carries no authenticity guarantee for a signature.",
        "A separate CGC and JSA service for comics that were signed earlier, which launched in May 2024.",
      ],
      couldnt: [
        "CGC's older comics lookup page was behind a bot check for us, so we could not see a populated result.",
        "CGC says images are available for some collectibles only, and we could not confirm which older holders have full details in the lookup.",
        "A matching number confirms CGC certified something under that number. Check that the label, the signature designation and the item all match.",
      ],
      why: "CGC is rated 91 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with CGC. Because its witnessed and unwitnessed labels carry different guarantees, check which label an item has.",
    } },
  { id:'uda', name:'Upper Deck Authenticated', rating:88, aliases:[], lookup:'https://upperdeck.com/hologram/', website:'https://upperdeck.com', authenticityPage:'https://upperdeck.com/authenticity-fraud-prevention/',
    profile: {
      summary: "Upper Deck, the trading card company founded in 1988, set up Upper Deck Authenticated (UDA) in 1992 as an early authentication system for signed memorabilia.",
      looked: [
        "Upper Deck's own pages. UDA says an Upper Deck representative witnesses each autograph by the high-profile athletes it works with, and that each signed item gets a serialized hologram and a certificate with a matching hologram. These are the company's own statements.",
        "Its hologram database: enter a hologram ID and it shows a photo and short description of the item the hologram was applied to.",
        "Collector reports, which are not official, that very old holograms may not be in the online database and that counterfeit UDA holograms and certificates have been made.",
      ],
      couldnt: [
        "A hologram that does not come up online is not proof of a fake, and one that does come up is not proof the item is real. Compare the hologram on the item with the one on the certificate.",
        "We could not measure how complete the database is.",
      ],
      why: "UDA is rated 88 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with Upper Deck.",
    } },
  { id:'fanatics', name:'Fanatics Authentic', rating:87, aliases:[], lookup:'https://www.fanatics.com/fansecure', website:'https://www.fanatics.com',
    profile: {
      summary: "Fanatics Authentic is the memorabilia business of Fanatics, one of the largest sports merchandise companies. It sells autographed and game-used items with its own serial-numbered hologram.",
      looked: [
        "Fanatics' own authenticity verification page: enter the hologram's two-letter prefix followed by its number (for example CV123456).",
        "Fanatics' name on other memorabilia brands: the Steiner Sports website now carries a Fanatics, LLC copyright notice.",
        "Reseller listings that describe a serial-numbered hologram on each Fanatics Authentic item.",
      ],
      couldnt: [
        "We could not see what the lookup returns for each type of item, so we could not compare it with a real piece.",
        "Collector guides warn that counterfeit holograms have been made for several issuers. A hologram that verifies still has to match the item in your hands.",
      ],
      why: "Fanatics Authentic is rated 87 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with Fanatics.",
    } },
  { id:'steiner', name:'Steiner Sports', rating:85, aliases:[], lookup:'https://www.steinersports.com/authenticity', website:'https://www.steinersports.com',
    profile: {
      summary: "Steiner Sports, founded by Brandon Steiner, says it has spent more than 30 years building relationships with athletes. Its website is now run by Fanatics.",
      looked: [
        "Steiner's authenticity page. Its guarantee says each hand-signed item comes with a certificate and a tamper-evident hologram whose serial number traces back to the original sale. This is Steiner's own guarantee.",
        "Its serial-number check, which covers Steiner Sports and SportsMemorabilia.com numbers, with a separate check for older hologram versions.",
        "The site footer, which shows Fanatics, LLC as the owner today.",
      ],
      couldnt: [
        "Collectors report that some older serial numbers do not show up in the current database. A missing number is a reason to ask questions, not proof of a fake.",
        "The serial number traces the item to a Steiner sale. It does not by itself show how the signature was obtained.",
      ],
      why: "Steiner Sports is rated 85 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with Steiner.",
    } },
  { id:'tristar', name:'TriStar Productions', rating:84, aliases:[], lookup:'https://www.tristarauthentic.com/', website:'https://www.tristarauthentic.com/',
    profile: {
      summary: "TRISTAR Productions runs autograph signing shows and private signings, and authenticates items signed under its own supervision with its own numbered hologram.",
      looked: [
        "Its website's description of the process: each item is signed under the direct supervision of a TRISTAR representative, a numbered hologram is applied to items signed at its shows and private signings, and the hologram number and details are recorded in its online verification system. These are TRISTAR's own statements.",
        "Its hologram design: a tamper-evident hologram that the site says destroys itself, leaving a honeycomb residue, if it is removed.",
        "Its online verification, a \"Verify TRISTAR Authentic Autograph Record\" button on its home page, where you enter the hologram number.",
      ],
      couldnt: [
        "Its website does not say when the company was founded or where it is based, and the page we read carried a 2020 copyright date, so we could not confirm how current its process description is.",
        "We could not see what a verification result shows.",
        "It authenticates items it also signs and sells at its own events, so there is no independent second opinion.",
        "We found no independent measurement of how often its authentication is right.",
      ],
      why: "TRISTAR is rated 84 out of 100, at the low end of the issuers whose numbers can be looked up (84 to 95), because it authenticates items it also signs and sells at its own events and we could not confirm how its lookup works. A seller-entered number counts at 75% of that until a Credabilia operator checks it with TRISTAR.",
    } },
  { id:'mlb', name:'MLB Authenticated', rating:89, aliases:[], lookup:'https://www.mlb.com/official-information/authentication', website:'https://www.mlb.com', authenticityPage:'https://www.mlb.com/official-information/authentication',
    profile: {
      summary: "Major League Baseball's authentication program began in 2001. MLB says it has authenticated more than six million items. Third-party authenticators, who are off-duty law enforcement officers working as contractors, witness the signing or the game use, and a numbered hologram is applied.",
      looked: [
        "MLB's own authentication page: enter the hologram's two-letter prefix followed by its number (for example CV123456) in MLB's database.",
        "How MLB describes the program: authenticators from Authenticators, Inc. witness each item, and the holograms are made by a security-printing company. These are MLB's own statements.",
        "What it covers: only items an authenticator actually witnessed. Holograms with a DB prefix mark officially licensed merchandise, not authenticated items, and will not appear in the database.",
      ],
      couldnt: [
        "MLB does not list exactly what its database returns, so we could not compare a result with a real item.",
        "The program does not cover past autographs or game-used items it did not witness, and it is not an appraisal.",
      ],
      why: "MLB Authenticated is rated 89 out of 100, in line with other long-established issuers whose numbers can be looked up (84 to 95). A seller-entered number counts at 75% of that until a Credabilia operator checks it with MLB.",
    } },
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
