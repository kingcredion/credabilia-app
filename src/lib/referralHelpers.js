/**
 * Referral System Helpers
 * Canonical normalization and attribution tracking for all referral flows.
 * These functions are actively used by:
 *   - layout.jsx  (signup attribution on ?ref= capture)
 *   - StripeCheckoutDialog.jsx  (credit-only purchase attribution)
 *   - createStripeCheckout.js  (Stripe purchase attribution via webhook)
 */

/**
 * Normalize referral code to uppercase.
 * @param {string} code
 * @returns {string}
 */
export function normalizeReferralCode(code) {
  if (!code || typeof code !== "string") return "";
  return code.trim().toUpperCase();
}

/**
 * Award referral signup entry to the REFERRER (not the current session user).
 * - Creates a canonical ReferralAttribution record (event_type: "signup").
 * - Increments the referrer's sweepstakes_entries by exactly 1.
 * - Idempotent: no-ops if an attribution already exists for this pair.
 *
 * @param {string} referrerId       - Referrer user ID
 * @param {string} referrerEmail    - Referrer email
 * @param {string} referredEmail    - New user's email
 * @param {string} referralCode     - The referral code used
 * @param {object} base44           - Initialized base44 SDK client
 * @returns {Promise<object|null>}  - Attribution record or null if already awarded
 */
export async function awardReferralSignupEntry(referrerId, referrerEmail, referredEmail, referralCode, base44) {
  if (!referrerId || !referrerEmail || !referredEmail || !referralCode) return null;

  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return null;

  // Guard: check for existing attribution to prevent duplicate entries
  const existing = await base44.entities.ReferralAttribution.filter({
    referrer_email: referrerEmail,
    referred_email: referredEmail,
    referral_code: normalized,
    event_type: "signup"
  });

  if (existing && existing.length > 0) {
    console.warn(`[referralHelpers] Duplicate signup attribution skipped: ${referredEmail} already attributed to ${referrerEmail}`);
    return null;
  }

  // Create the canonical attribution record
  const attribution = await base44.entities.ReferralAttribution.create({
    referrer_id: referrerId,
    referrer_email: referrerEmail,
    referred_email: referredEmail,
    referral_code: normalized,
    event_type: "signup",
    timestamp: new Date().toISOString()
  });

  // Increment sweepstakes entries on the REFERRER's user record (not current session)
  // We fetch the referrer by ID to avoid touching the current session user.
  const referrerUsers = await base44.entities.User.filter({ email: referrerEmail });
  if (referrerUsers.length > 0) {
    const referrer = referrerUsers[0];
    await base44.entities.User.update(referrer.id, {
      sweepstakes_entries: (referrer.sweepstakes_entries || 0) + 1
    });
  } else {
    console.warn(`[referralHelpers] Could not find referrer user record for email: ${referrerEmail}`);
  }

  return attribution;
}

/**
 * Create a canonical purchase attribution record.
 * Idempotent: no-ops if a purchase attribution already exists for this transaction.
 *
 * @param {object} params
 * @param {string} params.referrerId
 * @param {string} params.referrerEmail
 * @param {string} params.buyerEmail
 * @param {string} params.referralCode
 * @param {string} params.transactionId
 * @param {number} params.commission         - Commission in USD (not cents)
 * @param {object} params.base44
 * @returns {Promise<object|null>}
 */
export async function createPurchaseAttribution({
  referrerId,
  referrerEmail,
  buyerEmail,
  referralCode,
  transactionId,
  commission,
  base44
}) {
  if (!referrerEmail || !buyerEmail || !referralCode) return null;

  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return null;

  // Guard: check for existing attribution for this specific transaction
  if (transactionId) {
    const existing = await base44.entities.ReferralAttribution.filter({
      transaction_id: transactionId,
      event_type: "purchase"
    });
    if (existing && existing.length > 0) {
      console.warn(`[referralHelpers] Duplicate purchase attribution skipped for transaction: ${transactionId}`);
      return null;
    }
  }

  return await base44.entities.ReferralAttribution.create({
    referrer_id: referrerId || null,
    referrer_email: referrerEmail,
    referred_email: buyerEmail,
    referral_code: normalized,
    event_type: "purchase",
    transaction_id: transactionId || null,
    commission_amount: commission || 0,
    timestamp: new Date().toISOString()
  });
}

/**
 * Resolve an influencer record from a buyer's referred_by code.
 * Returns null if no active influencer found.
 *
 * @param {string} referralCode - The buyer's referred_by value
 * @param {object} base44
 * @returns {Promise<object|null>} - Influencer entity or null
 */
export async function resolveInfluencerFromReferralCode(referralCode, base44) {
  if (!referralCode) return null;
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return null;

  const influencers = await base44.entities.Influencer.filter({
    referral_code: normalized,
    status: "active"
  });

  return influencers.length > 0 ? influencers[0] : null;
}