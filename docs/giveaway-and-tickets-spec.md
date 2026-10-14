# Giveaway + ticket rewards (design agreed in chat 2026-10-14, NOT built yet)

Status: BUILT on branch giveaway-tickets (2026-10-14), NOT merged, NOT applied to production, NOT live. 358+ tests pass. The owner cannot afford a lawyer, so the system was made conservative by design (see "Built-in limits" below) and the official rules (/giveaway-rules) are written to match exactly what the system enforces; they were NOT lawyer-reviewed. Sales tickets and social-post tickets are not built.

## Built-in limits (from the legal research, 2026-10-14)
Sources read: FTC prize-promotion guidance (payment makes it a lottery; disclose no purchase necessary), NY Dept of State games of chance (registration + bond + $100 fee when prizes total over $5,000), Florida FDACS/849.094 (file 7 days before, trust account or bond, winner list, when prizes total over $5,000), IRS (prizes reported on 1099-MISC; threshold is $2,000 for 2026 payments, was $600), Apple App Review 5.3.1/5.3.2 (developer sponsors it; official rules in the app saying Apple is not a sponsor or involved in any manner), Google Play real-money/contests policy (drawings need a fixed number of winners, fixed entry deadline and prize award date; official rules in the app; no fee to take part).
- A prize must be worth LESS than $5,000 (admin_start_giveaway refuses otherwise), so NY and FL registration never applies. Prize in mind: Mike Vick jersey, about $125.
- Entrants and winners must live in the 50 states or DC and NOT in NY, FL or RI (giveaways.excluded_states; same list in src/giveaway.js, kept in step by a test). Entry requires choosing a state; the prize address state is checked too.
- NO early end: the end date (default 6 months) is fixed at the start (Google wants a fixed entry deadline). The earlier "draw early at X tickets" idea was removed.
- Two free ways to enter: in the app (Stripe-verified member) or by email to support@credabilia.com (an operator adds it in admin; 1 ticket; no account). An email winner is told by the operator, who records the delivery address.
- Prize ships within 30 days after the winner confirms an address (stated in the rules). Winner has 14 days to claim, then the alternate.
- Rules state: 18+, no purchase necessary, odds depend on tickets, Apple not a sponsor or involved in any manner, Nevada law. Re-read before each giveaway.
- Not covered / still a judgment call without a lawyer: whether listing and referral tickets and requiring Stripe verification are acceptable to every state regulator; social-post tickets (Facebook/Instagram promo rules, FTC disclosure) and sales tickets stay unbuilt.

## What it is
A platform-wide ticket system that rewards behavior, plus a pinned "giveaway" item (first prize idea: the Mike Vick signed jersey, which has a certificate number the owner says is fine; verify the number with the issuer through the certificate lookup before announcing it as authenticated).

## Giveaway item
- Admin flips an existing King's Collection item into a giveaway with a switch (and back). While ON the item cannot be bought, bid on, or offered on. Enforce in the database (triggers / checks in reserve_listing_checkout, buy requests, auctions), not just the UI. Cannot be switched on while a purchase, checkout or live bid is pending.
- Shown as one pinned card at the top of Discover: "WIN THIS" ribbon artwork (public/brand/sweepstakes-win-this-badge-v1.png, convert to light WebP) centered at the top of the photo with the crown just overlapping the edge; emerald green card, thin gold border and glow, drifting gold flakes reusing the sign-in sparks (LOGIN_SPARKS, .login-sparks, reduced motion respected, aria-hidden).
- Card + item page show: certificate details, "Free to enter" line, progress bar (time elapsed of the 6 months + live ticket total), the entrant's own ticket count, Enter button, rules link.
- Prize shipping is paid by Credabilia; the winner enters an address (first version: admin buys the label manually).

## Entry
- One-click "Enter the giveaway" with a rules checkbox. Signed-out visitors go through the normal sign-in (same handoff as "List your first item"), then confirm.
- Entry requires a fully set-up Stripe seller account (charges enabled). Say so clearly: on the card, on the rules step, and in the official rules. Suggested copy: "Free to enter. Requires a verified Credabilia seller account, set up through Stripe. No purchase necessary." / "To keep this giveaway fair and free of fake accounts, every entrant must complete payout setup with Stripe... Stripe collects the ID and bank details, and Credabilia never sees them."
- Entry is "pending" until Stripe confirms (charges_enabled); only confirmed entries count. Stripe collects ID/bank; we never see it. As of 2026-10-13: 28 members, 5 started Stripe, 0 fully enabled.
- Eligibility: 18+, US only, account in good standing. Free alternate method of entry (mail-in/web form) required by law. Check Stripe Connect per-account pricing before a big push.

## Tickets (platform-wide, earned continuously)
- Sign up (and verified): 1 ticket.
- Each published listing: +1 ticket, NO CAP. Guardrails instead: the listing must have been live 7 days, stay up through the draw (deleted/removed/fake listings void their ticket), meet the normal listing requirements, near-duplicates flagged; admin can void tickets and ban gamers.
- Referral: every sign-up that comes through your storefront/referral link and completes Stripe setup = +1 ticket for the referrer. Blocks: self-referral, same-device/fingerprint accounts, referrer cap not decided.
- LATER, after lawyer: tickets for selling an item (prize odds tied to a paid transaction), and tickets for posting your storefront on social media (verification + Facebook/Instagram promo rules + FTC disclosure issues).
- Each giveaway counts tickets earned inside its own window (each sweepstakes needs a defined entry period). Keep the ledger generic so new behaviors are just new rules.

## Draw
- Fixed end date set when the admin switches it on, default 6 months after the start. Rules must state exact start and end dates.
- Automatic on the end date: server picks one winner at random from valid tickets, records result + timestamp, checks the winner is still eligible and Stripe-ready, notifies them; alternate winner if no response in 14 days.
- No early draw (removed). Milestone emails/card updates at 3 months, 1 month, 1 week (not built).
- Rules must say odds depend on the number of entries. If the prize is over $5,000: New York and Florida registration/bonding. Prize tax reporting (IRS Form 1099-MISC) now starts at $2,000 for 2026 payments (it was $600); a W-9 from the winner is needed.
- Use Mike Vick's name factually only; no implied endorsement.

## Referral links (stage 2)
- Reuse the storefront link (credabilia.com/<slug>, profiles.slug, optional today). Fallback for members without a slug: credabilia.com/?ref=<code>.
- Remember the storefront the visitor came from (first touch, ~30 days, like the list-intent handoff), then after account creation call a server function that sets referred_by once (not self, profile new). Reward ticket only after the referred member completes Stripe setup. Show the referrer counts, not names.
- A storefront with no listings shows a carousel of other platform items ("This member has not listed yet, but see what else is in the kingdom"); once they list, the page shows their own items.
- App installs cannot be attributed to a referrer (no deferred deep links); web sign-ups can.

## Build order
1. Ticket ledger, giveaway record, DB block on buying, entry + Stripe gating, automatic draw.
2. Admin switch.
3. Card + item page with ribbon, emerald look, progress bar.
4. Referral links and tickets.
5. After lawyer: sales tickets, social-post tickets.
Everything stays hidden until an admin switches a giveaway on. The apps bundle their own web code, so the card reaches iPhone/Android only after an app update (iPhone 1.0.1 TestFlight build is being done first without it).
