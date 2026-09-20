# Original-app simplification inventory

Reviewed September 15, 2026. Source: original exported `../credabilia/src` and `../credabilia/base44/functions`, compared with this new copy and the existing preservation/listing audits. This is a feature-scope audit, not a complete runtime/security audit. Source presence does not prove a feature is used, deployed, or working. No original code or live data was deleted. Recommendations below are not previously approved permanent removals.

## Replace or remove from the new implementation

| Original element | Proposed treatment | Evidence |
| --- | --- | --- |
| Base44 authentication, entities, integrations and function runtime | Replace with Supabase and explicitly selected service APIs; retain business capabilities | src/api, pages using base44; base44/functions |
| Old testing accounts and records | Fresh start authorized by owner; no need to migrate them; do not interpret as permission to wipe live data now | Conversation decision |
| MyVets and MyAudits overlapping history screens | One audit-history screen; preserve history functionality and redirects where needed | Both pages query Vote by voter_email |
| CouncilRewards/AuditorRewards terminology | One auditor-rewards name; preserve useful functionality; legacy URL alias is compatibility, not a second feature | pages.config.js |
| Repeated listing AI calls for extraction, persuasive description and tags | One optional, reviewable AI draft; certificate reading remains separate | CreateListing.jsx; create-listing/Step2Description, Step5Finalize |
| Overlapping category/attribute arrays and sports-centric fields | Five main categories with relevant typed attributes and tags | create-listing components; CREATE-LISTING-AUDIT.md |
| Placeholder COA for original art | Remove placeholder; support accurately labeled artist documentation | CreateListing.jsx |
| Competing score calculations, AI confidence as authenticity evidence, upload-only score bonuses | One server-calculated score; preserve issuer weighting and community contribution | create-listing scoring; utils/trustScore; current credibility migration |
| Persuasive AI text implying unsupported provenance/authenticity | Factual seller-reviewed descriptions, unknown fields left blank | Step5Finalize; listing AI prompts |
| Subscription/trial setup intertwined with first listing | Remove that interruption from drafting; selling eligibility belongs at the commercial boundary if retained | CreateListing.jsx |
| Public-facing payment simulation and temporary launch/test messaging | Keep test tooling isolated from normal production use | StripeSimulation; simulatePayment; marketplace testing presentation |
| Browser-driven reward/credit write workflows | Replace with server-authorized, duplicate-safe operations when restored; do not remove rewards as a concept | CouncilRewards.jsx credit adjustment/distribution; current atomic audit rewards |

Do not label a file dead just because it has no direct page registration: custom routes, dynamic imports and service callers must be checked before deletion. In particular, checkout/OAuth/profile pages and legacy route aliases may still serve a purpose.

## Proposed exclusions from the first release, source retained

| Feature family | Original scope/evidence | Recommendation |
| --- | --- | --- |
| Marketing automation | MarketingHub; campaigns; generateDailyCampaign; scheduled posts; retry/cleanup workers; Runway/Sora; YouTube; Klaviyo | Leave out of the core app initially; adds provider costs and operational work |
| Framing marketplace | ExploreFrameShops, FrameShopProfile/Dashboard, AdminFrameShops/FramingRequests; quote/payment/reminder functions | Defer directories, custom quotes and framing fulfillment |
| Artist services | ExploreArtists, ArtistProfile/Dashboard, AdminArtists; artwork/commission tabs | Defer specialist program and commissions; retain art as a listing category |
| Influencer/affiliate program | InfluencerDashboard/Profile, AdminInfluencers; referral conversion and commission reporting | Defer special dashboards and commission system |
| Founder/investor program | FounderCircleDashboard/Profile, AdminIndiegogoInvestors; credits and benefits | Defer program-specific screens; review any real obligations before retiring |
| Sweepstakes/referral campaigns | RewardCenter Sweepstakes and referral attribution | Defer promotional campaigns; keep education independent of sweepstakes |
| Cash-equivalent auditor rewards | CouncilRewards monthly pool, top-10% eligibility and credit distribution | Defer financial rewards until rules, accounting and abuse prevention are implemented |
| Broad social network | Feed, ExploreUsers, follows, activity feed and public discussion | Defer social expansion; buyer/seller communication is a separate core need |
| Bulk/import/platform synchronization | BulkUpload components; enrichBulkItems; PlatformConnection; shopifyAuth/OAuthConsent | Defer until single-item listing works reliably |
| Advanced discovery and automation | aiSearch, googleVisionProductSearch, analyzePlatformFees | Defer extra AI tools pending clear demand and cost evaluation; retain ordinary search |
| Seller subscriptions and premium gates | VendorSubscription/createSubscription and listing trial logic | Business-model decision still open; not permanently canceled |
| Specialized program administration/analytics | Admin pages for deferred artist/framing/influencer/founder systems | Defer with their parent systems; retain essential moderation/admin controls |

## Keep, even if still unfinished

- One account and collector/seller/auditor workspaces with permissions.
- Marketplace browsing, search, sorting, useful category filters and pagination.
- Listing creation and editing, photos, AI prefill, tags and category-specific details.
- Certificate uploads, issuer trust weights, number correction and official lookup links. A supplied certificate is not proof that the issuer record or physical item was independently verified.
- Community audit queue, evidence viewing, assessment history, own-item/duplicate protections and understandable score breakdown.
- Educational trivia and explanations that teach item auditing; learning progress and participation rewards. Do not automatically equate trivia XP with authentication expertise; qualification/weighting remains a design decision.
- Profiles, settings, account deletion, favorites/watchlist and collection management.
- Buyer/seller messages and necessary notifications.
- Moderation, reports, support and administrator permissions.
- Checkout, payments, refunds, seller payouts, shipping and tracking before public commerce; these are deferred implementation, not deleted marketplace features.
- Terms, privacy and refund information appropriate to final behavior.

## Current implementation versus intended scope

The new copy implements the account/workspace foundation, basic browsing, listing creation with photos, partial seller edits, certificate extraction/lookup, issuer/community scoring and basic audit participation. AI listing drafts, structured listing attributes/tags, full edit coverage, trivia, broader account/social/commerce systems remain incomplete. Existing FEATURE-PARITY.md contains older verification checkpoints; later README checkpoints supersede them for hosted photo/certificate tests and partial edits. Absence from the new copy is not evidence of an agreed removal.

## Next implementation priority

Finish one reviewed listing draft flow (photos/notes, optional AI suggestions, confirmed category/attributes/tags, certificate and seller-set price), then verify the seller-to-buyer-to-auditor journey. Decide the deferred feature families as product scope before rebuilding them. Preserve the original export as reference throughout.
