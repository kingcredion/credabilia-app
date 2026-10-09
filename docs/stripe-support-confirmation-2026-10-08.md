# Stripe support chat: confirmation of our payment flow (2026-10-08)

Source: live chat with Stripe support agent "LK" (platform account, Credabilia LLC), started from support.stripe.com.
This is a chat answer, not a formal account-review ruling. Keep it with the compliance records.

## What we asked
Whether our flow is allowed: Credabilia is a marketplace where buyers pay us through Stripe; we hold the payment until the item is delivered, then transfer it to the seller (Connect Express, separate charges and transfers, `source_transaction`), and we carry negative-balance liability.

## What LK answered (verbatim, three messages)
1. "So, to answer your question if your connect fund flow is supported or not: - Yes, your fund flows using (Connect Express, separate charges and transfers, payment held until delivery is confirmed) is allowed and confirmed because Separate Charges and Transfers is a supported and common model for marketplaces that need to hold funds pending a condition (like delivery confirmation) before paying out sellers — this pattern itself is not unique to Escrow-flagged businesses."
2. "Holding a Transfer until a delivery/inspection condition is met, where you as the platform remains liable for the charge and any negative balance, is generally consistent with standard platform liability — not Payment Facilitation/Aggregation (which typically implies the platform taking on liability it's disclaiming, or passing funds through without this liability model)."
3. "Just ensure that your platform (not a third party) controls release of the Transfer, and that there's no mechanism for buyers/sellers to independently request release of held funds outside your platform's process (this is the main Escrow-services distinguishing factor)."

## How we meet the condition in message 3
- Only the platform creates the Transfer: the hourly `release-stale-escrow` job (service role) pays what the database says is due. No buyer or seller action creates a transfer.
- A buyer confirming they are satisfied only shortens the hold timer for established sellers; the platform job still performs the release. Open refund requests, card disputes, review holds and bans block release.
- Terms section 8 now says: "Credabilia, not the buyer or the seller, decides when and whether a held payment is released." (commit 49590b6)
