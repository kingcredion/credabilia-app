/**
 * Stripe status helper utilities
 * 
 * Provides a single source of truth for determining:
 * - Whether an account is using simulated Stripe
 * - Whether an account has a real, live Stripe Connect connection
 */

/**
 * Check if a user account is using simulated Stripe
 * @param {Object} user - User object
 * @returns {boolean} True if stripe_account_id starts with "acct_simulated_"
 */
export function isSimulatedStripeAccount(user) {
  if (!user?.stripe_account_id) return false;
  return user.stripe_account_id.startsWith('acct_simulated_');
}

/**
 * Check if a user has a live, real Stripe Connect account
 * @param {Object} user - User object
 * @returns {boolean} True if:
 *   - stripe_account_id exists
 *   - stripe_account_id does NOT start with "acct_simulated_"
 *   - stripe_charges_enabled === true
 */
export function hasLiveStripeConnect(user) {
  if (!user?.stripe_account_id || !user?.stripe_charges_enabled) return false;
  return !user.stripe_account_id.startsWith('acct_simulated_');
}