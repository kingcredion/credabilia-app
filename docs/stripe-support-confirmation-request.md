# Request to Stripe: written confirmation of how Credabilia holds and releases payments

Send this through the Stripe Dashboard (Help > Contact support), from the account owner. Keep Stripe's written reply with the compliance documents.

---

Subject: Please confirm our Connect marketplace payment flow is permitted

Hello Stripe team,

Credabilia LLC (Nevada) runs a marketplace for sports and entertainment memorabilia in the United States (credabilia.com). Before we launch widely, we want to confirm in writing that our payment flow is permitted under the Stripe Services Agreement and the Restricted Businesses list.

How it works:
1. A buyer pays Credabilia through Stripe Checkout. We use Connect with Express accounts for sellers (Stripe-hosted onboarding, so Stripe collects identity and bank details).
2. We use separate charges and transfers, as described in Stripe's Connect documentation for holding funds until goods are delivered. The charge is created on our platform account and the seller is paid with a Transfer linked to the charge by source_transaction.
3. The transfer to the seller is made only after carrier tracking confirms delivery (or a verified in-person handoff for local pickup) and a short inspection period has passed: 2 to 3 days for established sellers and 3 to 7 days for new sellers, with no open refund request and no open card dispute. A parcel that is never marked delivered is paid after 21 days in transit.
4. If a buyer requests a refund during that period, or a card dispute is filed, the transfer is not made. Refunds are made from the platform balance.
5. We are responsible for negative balances on our connected accounts. We do not describe or operate the hold as an escrow service, and our Terms say it is a payment hold and not an escrow, trust or deposit-taking service.

Our questions:
- Is this flow permitted for our use case, and does it fall outside the "Escrow services" and "Payment facilitation and aggregation" entries on the Restricted Businesses list?
- Are there changes you would like us to make to how we hold or release payments, the length of the hold, or how we describe it to buyers and sellers?
- Is there anything about selling signed memorabilia (certificates of authenticity, counterfeit risk) that you would like us to handle differently, for example seller verification, listing rules or dispute handling?

We also set the following controls, which we mention in case they help: tiered payout holds for new sellers, payout freezes and bans (including by card and bank fingerprint), 3D Secure and delivery signature for orders of $500 and above, a notice buyers confirm before paying for items without a verified certificate, a seller statement of authenticity at listing, and automatic evidence drafts for card disputes.

Thank you,
Credabilia LLC
