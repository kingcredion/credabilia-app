# Credabilia preservation checklist

The reference is `../credabilia-payments-v1`, the repaired copy of the Base44 export. Presence in code establishes a feature candidate, not proof that it is active or working. Nothing should be classified as obsolete merely because the new foundation lacks it. Original ZIP, GitHub repository, and production website remain unchanged.

| Original system / evidence | New-copy status | Work still required |
| --- | --- | --- |
| SignIn, Onboarding, Profile, Settings, ResetPassword, deleteAccount | Email-link form and account bootstrap; one account with three workspaces | Hosted login verification, onboarding/profile controls, account deletion |
| CreateListing, EditListing, MyListings, BulkUpload, ItemDetails | Text and photo listing creation and viewing | Hosted photo acceptance testing, edits, bulk listing and category-specific details |
| create-listing/constants, trustScore, CredibilityMeter, submitAudit | Certificate metadata, issuer lookup controls, authoritative certificate/community score and visible breakdown | Photo evidence, original advanced audit weighting, moderation |
| AICoaAnalyzer, analyzeItem, enrichBulkItems, googleVisionProductSearch | Deployed server-side image reader, private key configuration and seller confirmation UI | Real signed-in extraction and quality/billing verification |
| VettingQueue, MyVets, MyAudits, Vote | Audit submission, own-item exclusion, duplicate protection, private history in service | Full history UI, original queue filters, auditor qualification/review |
| TriviaChallenge, triviaChallenge, TriviaQuestion/Response | Auditing guide only | Educational trivia, explanations, question management, server-side grading |
| RewardCenter, CouncilRewards, CreditLedger, XPEvent | Atomic five-point audit reward | Daily challenges, streaks, credit ledger, redemption and qualification rules |
| Marketplace, Home, Watchlist, MyCollection, Favorite, ItemLike | Basic collection browsing, category/search | Original sorting, pagination, favorites/watchlist, owned collection |
| Messages, Feed, Comment, Follow, Notification | Not migrated | Conversations, social feed, notifications and access rules |
| Checkout pages, Stripe functions, PendingSale, Transaction, VendorSubscription | Not migrated | Checkout, refunds, payout onboarding, subscriptions and webhook handling |
| VendorShipping, TrackPackages, shippo, Shipment | Not migrated | Addresses, labels, tracking, shipping webhook handling |
| PlatformConnection, shopifyAuth, OAuthConsent | Not migrated | Recover original platform workflows and reconnect approved services |
| Artist/FrameShop/Influencer/Founder pages and entities | Not migrated; usage not yet confirmed | Preserve source and determine active workflows before removal |
| MarketingHub, campaigns, scheduled posts, Sora/Runway/YouTube functions | Not migrated; usage not yet confirmed | Preserve source; assess intended scope and credentials |
| Admin pages, SupportTicket, Flag, Announcement | Not migrated | Moderation, support, administrator access, analytics |
| Terms, Privacy, RefundPolicy | Not migrated | Carry over and review against resulting product behavior |

## Certificate scoring decisions

- Preserve the original listing catalog ratings (PSA/DNA 95, JSA 92, BAS 93, etc.), including the existing Credabilia 100 configuration. These are product settings, not external certifications or independently measured probabilities. Their calibration remains a launch-review item.
- Use canonical issuer IDs and normalize PSA/PSA-DNA and Beckett/BAS aliases. The conflicting old scoring map is not used as a second authority. Tests compare every client catalog rating against the server rating function.
- Preserve the old 80/20, 65/35, 50/50 and 35/65 blend thresholds and five neutral baseline votes. A supplied certificate number activates the issuer rating, consistent with the previous certificate-artifact check. An issuer name alone is not enough.
- The current verdict vocabulary maps Looks consistent/Need more evidence/I see concerns to 100/50/0. The old vocabulary was authentic/suspicious/counterfeit. This is a visible semantic difference, not a claim of exact feature parity.
- Each audit currently counts equally. Original rank-weighted votes, AI-confidence fallback and seller-credibility fallback are NOT restored. Participation points remain separate from expertise. Qualification must be settled before introducing stronger vote weights.
- Scores are calculated by the database from stored certificate metadata and audits; browsers cannot submit an overriding score or vote weight. No rows of private audit explanations are included in public scoring responses.
- All certificate metadata is labeled seller-provided. No issuer has been contacted to validate an individual item. Lookup buttons currently open official search pages for PSA, JSA and Beckett; they do not claim a matching record was found. Additional issuer links await source verification.
- Photo uploads and server-side AI extraction are implemented and deployed. Actual signed-in extraction remains unverified. The suggestion normalizer rejects AI-provided URLs and ratings.

## Current verification

Automated tests execute all migrations in PGlite, compare preview and server scoring at 0/1/9/10/24/25/99/100 audits, check all issuer ratings and enforce certificate field validation and write permissions. Hosted email delivery was observed earlier, but completed live login remains unverified after rate limiting.

## Next preservation work

1. Verify hosted item/certificate uploads through a real signed-in seller.
2. Verify the deployed reader with a real certificate and check seller confirmation, unreadable-image handling and provider access.
3. Recover the original edit-listing and category details, then trivia and its educational explanations.
4. Complete hosted two-user acceptance testing; migrate commerce and integrations after their required accounts are connected.
