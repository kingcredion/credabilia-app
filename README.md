# Credabilia — new foundation

Independent React/Vite application with Supabase Auth and PostgreSQL. The original Base44 export and repaired copy remain separate. This is a foundation, not full feature parity with the original app.

See [FEATURE-PARITY.md](FEATURE-PARITY.md) for the original-code preservation checklist and explicit gaps.

## Certificate and credibility checkpoint

Certificate issuer, certificate number and an optional custom company name now persist with listings. Official lookup buttons currently cover PSA, JSA and Beckett; buyers can copy the number. Other issuers do not receive invented destinations. Photo upload and AI deployment status is recorded in the deployment checkpoint below.

Migrations `202609100002_certificates.sql` and `202609100003_credibility.sql` were successfully applied to the new Supabase project through SQL Editor. Do not rerun them there. The server computes credibility from issuer ratings and community audits using the original dynamic blend thresholds and neutral smoothing. The visible breakdown explains seller-provided certificate details, the baseline and equal audit weighting. It does not claim issuer verification.

Six automated tests pass, including database/preview parity at every scoring threshold and consistency across all issuer ratings. Production build passed. Browser verification created a fictional PSA practice listing with number 00001234, confirmed the official search URL, preserved leading zeros and displayed 86/100 with the 95-point issuer input and 80/20 weighting. This sample is local only.

## Run locally

Use Node.js 24 and run `npm ci`, then `npm run dev`. Open http://127.0.0.1:5174.

Copy `.env.example` to `.env.local` and set the project URL and **publishable** key. Never put a database password, secret API key, service-role key, or OAuth client secret into a VITE variable. `.env.local` is ignored by Git.

The current local configuration connects to project `zedgmuovulbyclprokub`. Explicit `VITE_DEMO_MODE=true` enables the separate browser-only sample workspace. Demo data is never imported into Supabase. An unconfigured production build fails closed.

## Installed on September 10, 2026

The foundation migration was applied successfully through the Supabase SQL Editor, inside a transaction. Its SQL is in `supabase/migrations/202609100001_foundation.sql`; do not rerun it on this project. For a fresh project, apply it once before allowing signup. SQL Editor execution does not automatically record a Supabase CLI migration history; reconcile that baseline before adopting CLI deployment.

Six tables support profiles, account permissions, progress, listings, audits, and reward receipts. All use row-level security. Writes go through permission-checking functions. An account-creation trigger creates the profile and permission/progress records. User metadata cannot grant privileges or XP. Initial accounts can sell and submit community audits; these permissions do not confer verified expert status.

Auditors cannot audit their own items. A unique constraint prevents duplicate audits, and the audit, reward receipt, and five participation points commit together. Participation points are not an expertise score.

## Login

The UI uses email magic links with Supabase's PKCE session flow. The same form supports new and returning users. Open the email link in the same browser that requested it. Google has an adapter method but is not exposed or configured; Apple is not implemented yet.

Configured hosted Site URL: `http://127.0.0.1:5174`.
Allowed callbacks: `http://127.0.0.1:5174/auth/callback` and `http://localhost:5174/auth/callback`.
Replace/add these with the actual HTTPS deployment URL when hosting. The host must route `/auth/callback` to `index.html` — and more generally, since this is a single-page app with no server-side routing, the host must fall back to `index.html` for *any* unrecognized path, not just `/auth/callback`. This also serves seller storefront links (`/<their-store-name>`), which are otherwise indistinguishable from `/auth/callback` at the hosting layer.

Supabase's default email sender only supports project team email addresses and has strict rate limits. Configure custom SMTP before outside testing. See [Supabase email delivery documentation](https://supabase.com/docs/guides/auth/auth-smtp) and [email login documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Validation

`npm test` executes the actual migration in embedded PostgreSQL (PGlite), with a small simulated auth schema. It checks private-row visibility, blocked direct writes, trusted ownership, invalid listings, self-audit rejection, duplicate rewards, revoked permission, and atomic rollback. This is not an end-to-end hosted identity test or multi-session concurrency test.

`npm run build` passed. Live read-only checks confirmed public browsing returns HTTP 200 with an empty collection, public profiles return HTTP 401/permission denied, email auth is enabled, and signup is enabled. The app and email form were opened through the browser against the live project.

Pending: the owner must complete the first email-link login to verify email delivery, callback, and hosted profile creation. No email was sent by the assistant, no test user was fabricated, and no credentials were requested in chat.

## Remaining product work

### Two-account journey checkpoint

The local practice preview now offers Alex Morgan and Jordan Lee as separate accounts. Each account still has all three workspaces; switching accounts requires signing out and selecting the other account. The original one-account sample state is left untouched under its older storage key; the two-account preview starts with fresh sample data.

Browser verification passed: Alex created a $19.99 fictional listing, own-item auditing was blocked and excluded from Alex's audit queue, Jordan submitted an assessment and earned five participation points, the recorded assessment replaced the form, and the item left Jordan's queue. Automated journey tests additionally verified duplicate submissions do not add points, progress survives recreating the service, signed-out writes fail, and Alex does not receive Jordan's points or private audit history. A stale sign-out notice was fixed.

For a separate practice server in PowerShell, run `$env:VITE_DEMO_MODE='true'; npm run dev -- --port 5175` from a new terminal. The connected live app remains on port 5174. These practice users and listings are never written to Supabase.

Live email login remains unverified after the owner encountered the test email rate limit. The local journey and database tests do not replace a hosted two-user acceptance test.

Hosted photo/AI acceptance testing, checkout and payments, shipping, external marketplace integrations, full educational trivia, moderation and expert qualification, account-management flows, catalog pagination, and complete cross-user hosted testing remain. Current browsing returns the newest 100 active listings. Listing creation does not yet have retry idempotency. Do not launch for public commerce yet.

## Photo and certificate-reader deployment — September 10, 2026

Migrations 004 (private photo storage/publishing) and 005 (five AI reads per user per hour) were applied successfully through the hosted SQL Editor. Do not rerun them on this project. Reconcile CLI migration history before using db push.

The extract-certificate Edge Function is deployed. Dashboard index.ts combines the repository handler.js (without its export keyword) with the createClient import and Deno.serve entry point. OPENAI_API_KEY is saved only in Supabase secrets. CERTIFICATE_AI_MODEL is gpt-4.1-mini. Legacy gateway JWT verification is off; the function itself calls auth.getUser() and checks photo ownership and database quota before contacting OpenAI. No service-role key is used.

Item photos (up to six) and certificate photos (up to three) are resized and converted to JPEG before uploading. Unpublished photos are private to the seller; published photos are accessible through signed URLs. Sellers review and confirm certificate details before publishing. AI reads issuer/number only and does not establish authenticity or provide a score. The practice preview supports photos but does not pretend to run AI.

Validation: all nine automated tests passed, production build passed, hosted browse returned 200, and the deployed function returned its own 401 response for missing and invalid user tokens. Model extraction tests use a mocked provider. A real signed-in photo upload and OpenAI extraction remain unverified; provider billing/model access and extraction quality are not established by saving a key or deploying the function.

Model reference: https://developers.openai.com/api/docs/models/gpt-4.1-mini

## Live certificate test — September 11, 2026

Owner completed email-link login in the browser. Item and certificate uploads succeeded against hosted storage. A real OpenAI extraction returned issuer Beckett Authentication Services and number AB0952 from the public Fanatics Collect sample. Added the full issuer name and BAS-suffixed alias to canonical matching (regression tested). The auction description lists AB09652, so this mismatch remains unresolved; the small certificate photo is not reliable enough to settle it. Do not silently substitute a number or mark the record verified. Test listing was left unpublished for review. Full publish/read-back and issuer verification remain pending.

Alternative image test: the same item’s PSA/DNA certificate uploaded and extracted successfully, but the provider returned A109142 versus AI09142 in the source description (I/1 ambiguity). Added PSA/DNA Authentication Services aliases with regression coverage. The second image is also a small source rendition. Do not treat either trial as successful exact-number OCR; obtain higher-resolution source images before concluding quality. Draft remains unpublished.

Manual-correction acceptance checkpoint: user authorized overriding OCR for the test. Selected PSA/DNA and corrected the number to AI09142; evidence notes disclose manual correction and unverified issuer record. Published the explicitly labeled TEST ONLY - NOT FOR SALE listing on the new test backend. The item detail returned both photo links, PSA/DNA, AI09142, the official https://www.psacard.com/cert lookup destination, and server credibility 86/100 (issuer95 at80%, neutral community at20%). This establishes hosted upload/create/read-back, not accurate OCR or issuer verification. Production Base44 site was not changed.

## Listing edits — September 11, 2026

Migration 202609110006_listing_edits.sql applied successfully through hosted SQL Editor. Sellers can edit title, category, description, evidence notes and price on active listings before assessments. After an assessment, only price may change. Photos/certificate fields are not editable in this phase. The database checks ownership, selling permission, validation constraints and an expected snapshot to reject stale saves. Listing row locks coordinate with audit submissions. The edit dialog holds the original snapshot even if account data refreshes while open.

Ten automated tests passed, including unauthorized edits, stale writes, invalid prices, protected reviewed details and unchanged participation rewards. Build passed before the final snapshot-reference adjustment. Hosted seller UI acceptance remains pending; the current account is the test auditor, not the listing owner. This is partial edit coverage, not full original EditListing parity.

## Structured listing details — September 15, 2026

Added optional category-specific seller details and up to eight normalized tags, buyer detail display, and search matching for both. Practice mode saves these across reloads. Tags and attributes do not change credibility. Structured details/tags are creation-only in this increment; category changes on records with details are blocked until detail editing is implemented.

Twelve tests and the production build passed. Tests cover persisted practice data, database validation, denied direct writes, anonymous publishing rejection, public read-back, category-change protection and unchanged scoring. Browser visual verification has not been performed.

Deployment pending: apply migration 202609150007_listing_details.sql to the test Supabase project, then set VITE_LISTING_DETAILS_ENABLED=true in the local environment and restart Vite. Do not enable before the migration. The connected app keeps its existing creation flow until enabled; practice mode enables the fields now. No hosted database changes were made in this increment. AI listing suggestions and item-based trivia generation remain unimplemented.
