# Apple App Review reply (Guideline 2.1, information needed) - 2026-10-08

Apple's message on iOS 1.0 (5) asks for six things. Items 2-6 are drafted below, ready to paste into
"Reply to App Review" and into the Notes field of App Review Information. Item 1 (screen recording)
must be filmed on a real iPhone.

## 1. Screen recording (user to film on the iPhone, latest iOS, start from launching the app)
Suggested run, about 3 minutes:
1. Launch the app, browse Discover (no sign-in needed), open an item and its Item Credibility score.
2. Tap Sign in > "Review Team sign-in" (no code needed), show signing in.
3. Show a listing being created (photos, AI draft), the audit queue, and Messages.
4. Show reporting and blocking: item or message > Report; user > Block.
5. Profile and settings > Delete account (stop at the confirmation screen, do not delete the review account).
6. Show the checkout screen up to the Stripe payment step. Do not pay (payments are live).

## 2. Purpose and target audience
Credabilia is a marketplace for sports and entertainment memorabilia (signed items, trading cards, comics, art). Buyers
cannot easily tell how much evidence stands behind a collectible. Every listing shows an Item Credibility score
(80% the issuer's own rating, 20% community audits) with certificate details, issuer lookups and photos in one place,
plus an AI second look at signatures. Sellers get a simple listing flow with an AI draft from a photo. Buyers pay through
Stripe and funds are held in escrow until delivery. Audience: adults 18+ in the United States who collect or sell memorabilia.

All purchases are physical goods paid by card through Stripe, so no in-app purchase is involved. Users sign in with
Sign in with Apple, Google or an emailed code; the attached video shows launch, Sign in with Apple, selling, buying,
reporting and blocking, and account deletion.

## 3. How to access the main features
Browsing Discover needs no account. To sign in: tap Sign in, then "Review Team sign-in" (no password or code). That signs in
the review account appreview@credabilia.com. With it you can create a private test listing, use the community audit queue, use
Messages, report and block users, and open Profile and settings > Delete account. The review account cannot buy or bid because
real payments are live, so please do not buy real items. Normal users sign in with Google or an email code.

## 4. External services used
- Supabase: database, authentication, file storage and server functions
- Stripe (Connect and Checkout): payments, seller payouts, escrow
- Shippo: shipping labels and tracking
- OpenAI: AI listing draft and the AI signature opinion
- Photoroom: automatic photo background removal
- Klaviyo: transactional and marketing email
- Twilio: optional SMS notifications
- Google Sign-In, Google Ads and Microsoft Clarity (analytics with masking; Europe excluded)

## 5. Regional differences
The app is for the United States only. It functions the same everywhere it is available. Analytics and advertising
tracking are off by default for visitors in the EEA.

## 6. Regulated industry / protected material
Not applicable. Credabilia is a marketplace and does not authenticate items. Scores and AI opinions are opinions, not
guarantees, and users upload their own photos. Credabilia LLC is a Nevada company with a Nevada sales tax permit.
