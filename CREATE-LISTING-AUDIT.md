# Create-listing preservation audit

Reviewed September 11, 2026. Reference: ../credabilia-payments-v1. This is a source-code audit, not proof that every old flow worked in production. No original files were changed.

## What exists in the original

- src/pages/CreateListing.jsx: landing choices plus five steps; initializes structured attributes; generates 5–8 comma-separated tags during submission and saves them to Item.tags. Also saves sport, signer, team, year, grading and art fields. These useful fields are missing from the new foundation.
- src/components/create-listing/Step2Description.jsx: text-based AI extraction of title, sport, team, signer, year, authenticator and seven arrays of attributes. This step does not analyze item photos. Missing information is instructed to remain empty; returned attribute arrays are not checked against allowed values.
- Step3Categories.jsx: seller review/edit of AI suggestions and the full category selector.
- StepFineArtDetails.jsx: separate text-to-fields assistant for artist, medium, dimensions, provenance, year and stated price.
- Step4Details.jsx: item/certificate uploads, certificate analysis, grading, pickup and package measurements.
- Step5Finalize.jsx: separate AI call for a persuasive approximately 150-word description. The original uses another call for tags at publication.
- base44/functions/analyzeItem/entry.ts: post-creation image/title/category moderation analysis. This is separate from the listing prefill assistant; it should not be represented as the same feature.
- Marketplace.jsx: tags contribute to interest relevance, with signer/team/sport/year also used as display tags. Tags are useful discovery data, not just decoration.

## Keep and simplify

1. One optional Create draft with AI action, combining title, a short factual description, a main category, structured attributes and a small tag set in one response. Start from seller notes; optionally incorporate item images with explicit uncertainty. Certificate reading stays separate because it has a different evidence purpose.
2. Preserve the current five main categories. Store sport, team, signer/artist, year, item type and condition as attributes. Show only applicable fields. Art adds medium/dimensions; graded items add grading company/value. Signed and graded are separate properties.
3. Generate canonical search tags from confirmed attributes where possible. Normalize case/whitespace, deduplicate, cap count/length and reject unsupported claim tags. AI may suggest descriptive tags; tags must not establish authenticity, rarity or game-used provenance.
4. Seller reviews all suggestions in the same form; accepting suggestions does not silently overwrite subsequent manual changes. Unknown fields stay blank. Price remains seller-set (extract a stated price only, never invent a valuation).
5. Allow manual completion when AI fails. Add an explicit save-draft/resume path; no general autosave is evident in the original single-item flow inspected.
6. Retain certificate images, manual number correction and official lookup. Keep AI extraction confidence separate from credibility scoring.
7. Restore bulk/import workflows later, as secondary seller tools after single-item creation is reliable.

## Do not copy unchanged

- Seven overlapping category arrays: vintage appears under condition and era, and signed/certified/graded overlap across fields. Use one main category plus typed attributes instead.
- Sports-only wording and sport selection for general non-art items. Entertainment, comics and history need relevant fields, not forced sport values.
- Several AI calls across analysis, description and publication-time tagging. This increases latency and leaves generated tags outside the seller review step.
- Persuasive description prompt without a strong factual boundary. Do not invent condition, provenance, signatures or authentication claims.
- Initial score formula mixes AI confidence with issuer rating, adds points for a certificate upload and applies certificate-number penalties. Keep the single server scoring authority already implemented.
- Placeholder certificate for original art. An artist statement should be labeled as such, not substituted with an unrelated certificate image.
- Pickup/package fields collected in Step4Details are absent from the explicit finalData payload in CreateListing.jsx. Verify end-to-end persistence when shipping is restored.
- completedSteps calculates validation for display, while navigation and final publish do not enforce that full set centrally. Use consistent server validation.
- ActivityEvent creation happens after the item save without the reward-style failure isolation, so a later activity failure can report listing failure after the item exists. Use idempotent creation and nonblocking secondary events.
- Subscription/trial/payment setup mixed into the initial listing experience. Restore commercial eligibility at the appropriate publishing/selling boundary once commerce scope is implemented.

## Proposed seller experience

Photos + a few seller notes → optional AI draft → review price, category, relevant attributes and certificate → publish or save draft.

Implementation order: typed attributes/tags with server validation and search support; AI draft endpoint with quotas and strict schema; review UI; draft persistence; end-to-end tests. Tests should cover unknown facts, category mapping, tag normalization, manual overrides, provider failures and persistence into browse/search. Preserve reviewed evidence under the current edit restrictions until listing revisions/reassessment are implemented.

Status: audit and proposal only. AI listing prefill, tags, structured attributes and draft saving have not yet been ported to the new copy.
