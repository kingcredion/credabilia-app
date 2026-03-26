/**
 * Returns true if a transaction is simulated/test data.
 * Covers all known simulation sources:
 *  - payment_method: 'simulated_stripe' (functions/simulatePayment.js)
 *  - payment_method: 'simulated_purchase' (Messages.jsx)
 *  - stripe_payment_intent_id starting with 'sim_'
 *  - explicit is_simulated flag
 */
export function isSimulatedTransaction(t) {
  if (t.is_simulated === true) return true;
  if (t.payment_method === 'simulated_stripe') return true;
  if (t.payment_method === 'simulated_purchase') return true;
  if (t.stripe_payment_intent_id?.startsWith('sim_')) return true;
  return false;
}

/**
 * Filter an array of transactions to live (non-simulated) only.
 */
export function liveTransactions(transactions) {
  return transactions.filter(t => !isSimulatedTransaction(t));
}