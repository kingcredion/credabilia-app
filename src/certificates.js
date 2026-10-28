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
  // Issuers added after the 2026-10-28 industry review (research/memorabilia-authentication-research-2026-10-28.md). None has a public lookup we could confirm, so each is
  // handled like Frameworth: a flat rating that already reflects "we cannot check this one", counted in full and never cut to 75%. `kind` says what sort of evidence it is
  // (game_used: proof an item was used in a game; card_grade: a condition grade), and `howToCheck` is what a buyer can actually do. Every figure and statement in a
  // profile is from the sources named in that research file; the company's own claims are marked as such. Ratings are Credabilia's own product settings.
  { id:'tag', name:'TAG Grading', rating:75, aliases:['TAG','Technical Authentication & Grading','Technical Authentication and Grading'], lookup:null, noLookup:true, kind:'card_grade', website:'https://taggrading.com',
    howToCheck:"Scan the QR code on the slab: it opens TAG's digital grading report with images and the defect list.",
    profile: {
      reviewed:'2026-10-28',
      summary: 'A trading card grading company. By its own account it has used patented grading technology since 2015. It scores cards on a 1,000-point scale from high-resolution images, and each slab carries a QR code that opens a digital report.',
      looked: [
        "Its website: the 1,000-point scoring method, the digital image and grading report, and the QR code on every slab. These are the company's own statements.",
        'Industry volume figures: GemRate reported roughly 440,000 cards graded by TAG in 2025, compared with about 19 million at PSA, so it is a much smaller grader.',
        'Hobby guides and reviews: they describe a real, operating company with a documented method that is still building acceptance in the resale market, where its slabs generally sell for less than PSA or Beckett.',
      ],
      couldnt: [
        'We found no certificate-number search page, so Credabilia cannot check a number against TAG\'s records. The QR code on the slab is the way to check.',
        'We could not confirm who owns or runs the company.',
        'We could not confirm how widely auction houses accept its slabs.',
      ],
      why: 'TAG Grading is rated 75 out of 100. That is well above an issuer we know nothing about (50), because it is an operating company with a published method and a report anyone can open from the slab. It is below the issuers whose numbers we can check (84 to 95) because we cannot check a number against its records, and its market acceptance is still developing. The rating is not a verdict on any single card.',
    } },
  { id:'sia', name:'Sports Investors Authentication (SIA)', rating:70, aliases:['SIA','SIA Photo Match','Sports Investors Authentication','Sports Investors'], lookup:null, noLookup:true, kind:'game_used', website:'https://www.siaphotomatch.com/',
    howToCheck:"Read what the letter says it covers (a photo-match to a specific game is different from a finding that an item is consistent with team-issued gear), then ask SIA to confirm the letter.",
    profile: {
      reviewed:'2026-10-28',
      summary: 'A company that authenticates game-used sports memorabilia and photo-matches items to game photos. Its website is SIA Photo Match. By its own description it covers baseball, hockey, football and basketball items.',
      looked: [
        'Its website, siaphotomatch.com (the older sportsinv.com address redirects to it), which presents the company as a photo-match authentication service for memorabilia (the company\'s own description).',
        'Auction listings and news coverage that name SIA: a reported photo-match on a 1998 Michael Jordan NBA Finals jersey that sold privately for $14 million in October 2026, and SIA letters listed with PSA/DNA on a pair of ring-worn Hulk Hogan boots.',
        'Hobby coverage that lists SIA with MeiGray and Resolution Photomatching as one of the leading photo-match firms.',
      ],
      couldnt: [
        'We found no public lookup, so Credabilia cannot check a letter against SIA\'s records.',
        'We could not confirm who runs the company, when it started, or how it words its findings. Its website would not load fully for our review.',
        'Letters can cover different levels of service. A letter saying an item is consistent with team-issued gear is not the same as a photo-match to a named game, so what the letter actually says matters.',
        'There is no independent second opinion on a given letter.',
      ],
      why: 'SIA is rated 70 out of 100. That is above an issuer we know nothing about (50) and above Frameworth (65), because it is an independent company whose work is named on major auction lots. It is below the issuers whose numbers we can check (84 to 95), because we cannot check a letter against any record and could not confirm who runs it. The rating is not a verdict on any single item.',
    } },
  { id:'meigray', name:'MeiGray Group', rating:70, aliases:['MeiGray','MeiGray Authenticated','MeiGray Authentication','Mei Gray'], lookup:null, noLookup:true, kind:'game_used', website:'https://www.meigray.com', authenticityPage:'https://www.meigray.com/viewuserdefinedpage.aspx?pn=authentication',
    howToCheck:"Read the letter for the game or games it names and the photos it relies on, then ask MeiGray to confirm the letter.",
    profile: {
      reviewed:'2026-10-28',
      summary: 'A company founded in 1997 by Barry Meisel and Bob Gray that authenticates game-worn jerseys and other items. It is best known for photo-matching an item to photographs and video of the game.',
      looked: [
        'Press coverage: it photo-matched the Babe Ruth "called shot" jersey that sold for $24.12 million in 2024, and it is named on other high-value sales. Photo-match firms do not always agree: for that jersey, another firm had reviewed it earlier and did not issue a match.',
        'By its own announcement with JSA in April 2026, one MeiGray submission can request both MeiGray photo-matching and JSA autograph authentication.',
        'A 2023 case reported by Action Network: MeiGray withdrew a letter it had issued for a Michael Jordan jersey after the reporting showed the photographs it relied on had been altered. The company said it had been given counterfeit documentation and doctored images that it failed to recognize, and that it was exploring legal options and reaching out to law enforcement.',
      ],
      couldnt: [
        'We found no public lookup, so Credabilia cannot check a letter or hologram number against MeiGray\'s records.',
        'We could not read what MeiGray itself says about its process.',
        'A photo-match is only as reliable as the photographs it rests on, and a buyer cannot see those photographs from the letter alone.',
        'There is no independent second opinion on a given letter.',
      ],
      why: 'MeiGray is rated 70 out of 100. That is above an issuer we know nothing about (50) and above Frameworth (65), because it is an established independent firm, in business since 1997, named on some of the largest sales in the hobby, and it withdrew a letter when it found the evidence was false. It is below the issuers whose numbers we can check (84 to 95), because we cannot check a letter against any record, and that episode shows a letter can be wrong. The rating is not a verdict on any single item.',
    } },
  { id:'mears', name:'MEARS', rating:72, aliases:['MEARS Authentication','MEARS Authentications','MEARS Online','Memorabilia Evaluation and Research Services','Memorabilia Evaluation & Research Services'], lookup:null, noLookup:true, kind:'game_used', website:'https://mearsonline.com', authenticityPage:'https://mearsonline.com/evaluation-services/evaluation-grading-criteria/mears-exclusive-jersey-grading-and-authentication-criteria/',
    howToCheck:"Read the letter's grade and what it says about the item's use, then ask MEARS to confirm the letter.",
    profile: {
      reviewed:'2026-10-28',
      summary: 'Memorabilia Evaluation and Research Services, started in 2004 by Troy Kinunen, who is its president and CEO. It evaluates game-used bats and game-worn jerseys. Its website also links to a separate auction business, MEARS Auctions.',
      looked: [
        'Its website: named leadership, a 2004 start, and published grading criteria for bats and jerseys.',
        "What it says about its process (the company's own statements): evaluations use a 40-step worksheet, a research database and image analysis. Its criteria pages describe grading on a 1 to 10 scale, with points for factory and player characteristics and deductions for after-market additions or damage, and an item can be declined as unable to authenticate.",
        "Its own claims of reputation: that it has authenticated more than $200 million of memorabilia, and that its president was hired by the New York Giants as an expert on game-used authentication. We did not confirm either independently.",
        'Submitters are asked for the item\'s history, and later information can change a grade.',
      ],
      couldnt: [
        'We found no public lookup, so Credabilia cannot check a letter against MEARS\'s records.',
        'Its website does not explain how the evaluation business and the auction business are kept separate.',
        'A grade describes the item. Naming the specific game an item was used in depends on photos and provenance, so the letter\'s wording matters.',
        'There is no independent second opinion on a given letter.',
      ],
      why: 'MEARS is rated 72 out of 100. That is above an issuer we know nothing about (50) and above Frameworth (65), because it is an independent company with named leadership, published grading criteria and a long record, since 2004. It is below the issuers whose numbers we can check (84 to 95), because we cannot check a letter against any record. The rating is not a verdict on any single item.',
    } },
  { id:'resolution', name:'Resolution Photomatching', rating:72, aliases:['Resolution','Resolution Photo Matching','ResMatch','Res Match'], lookup:null, noLookup:true, kind:'game_used', website:'https://www.resolutionphotomatching.com', authenticityPage:'https://www.resolutionphotomatching.com/resmatch-process',
    howToCheck:"Ask Resolution Photomatching to confirm the ResMatch by its Match ID: its website says it looks these up on request by email.",
    profile: {
      reviewed:'2026-10-28',
      summary: 'A company that compares game-used items with photographs of the player to find a match. Press coverage says it was started in 2016 by John Robinson. Owners send photos by email, and the item does not have to be shipped.',
      looked: [
        "Its website: a published three-round process with more than 20 protocol steps in each round, drawing on over 30 outside image databases and an internal library of nearly one million images, usually taking about two weeks. These are the company's own statements.",
        "What a match produces, in its own words: a ResMatch certification with a Match ID and side-by-side photo graphics. Part of the fee is refunded if no match is made.",
        'Press coverage: it examined the Babe Ruth "called shot" jersey three times, in 2019, 2021 and 2022, without issuing a match, which shows it declines when the evidence falls short.',
      ],
      couldnt: [
        'There is no public online lookup. Its website says a match can be looked up by Match ID on request by email, so Credabilia cannot check one itself, but a buyer can ask.',
        'Its website does not name who runs the company.',
        'There is no independent second opinion on a given match.',
      ],
      why: 'Resolution Photomatching is rated 72 out of 100. That is above an issuer we know nothing about (50) and above Frameworth (65), because it is an independent company with a published process, a Match ID that can be confirmed with the company, and a record of declining a match when the evidence did not support one. It is below the issuers whose numbers we can check (84 to 95), because we cannot check a Match ID against any record ourselves. The rating is not a verdict on any single item.',
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
