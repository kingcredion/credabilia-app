/**
 * Vendor Reputation System
 * 
 * Tracks vendor performance and bridges marketplace visibility
 * to successful sales without modifying rewards/audit systems.
 */

/**
 * Calculate vendor quality score from vendor metrics.
 * 
 * Inputs:
 * - successful_sales (number): completed transactions
 * - dispute_rate (number, 0-1): ratio of disputed to total sales
 * - fulfillment_reliability (number, 0-1): on-time delivery rate
 * 
 * Returns vendor_quality_score (0-100).
 * 
 * Simple formula (no overengineering):
 * - Sales volume: primary signal (max 70 points)
 * - Reliability: secondary signal (max 30 points)
 */
export function calculateVendorQualityScore(vendor) {
  if (!vendor) return 50; // Safe default
  
  const successfulSales = vendor.successful_sales ?? vendor.vendor_total_sales ?? 0;
  const disputeRate = vendor.dispute_rate ?? 0;
  const fulfillmentReliability = vendor.fulfillment_reliability ?? 1;

  // Sales volume component (0-70)
  // Logarithmic: first 10 sales = big boost, then diminishing returns
  // Saturates at ~50 sales for 70 points
  const salesScore = Math.min(Math.log(successfulSales + 1) / Math.log(50) * 70, 70);

  // Reliability component (0-30)
  // Dispute rate penalty + fulfillment bonus
  const reliabilityPenalty = disputeRate * 30; // Max -30 points
  const fulfillmentBonus = fulfillmentReliability * 30; // Max +30 points
  const reliabilityScore = Math.max(0, fulfillmentBonus - reliabilityPenalty);

  // Combine and clamp
  const score = salesScore + reliabilityScore;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Update vendor metrics after a successful sale.
 * Called from StripeCheckoutDialog after purchase completion.
 * 
 * Returns { successful_sales, ... } to spread into User.update()
 */
export function incrementVendorSales(vendor) {
  return {
    successful_sales: (vendor.successful_sales ?? 0) + 1,
    vendor_total_sales: (vendor.vendor_total_sales ?? 0) + 1,
  };
}

/**
 * Get vendor quality score for use in item ranking.
 * Returns a small boost factor (0-0.1) to add to ranking score.
 * 
 * Max influence: ~10 points on 0-100 scale = ~5-10% impact.
 */
export function getVendorQualityBoost(vendor, itemTrustScore) {
  if (!vendor) return 0;
  
  const vendorScore = calculateVendorQualityScore(vendor);
  
  // Only apply boost if trust score is reasonable (>40)
  // Don't let vendor rep override low-trust items
  if (itemTrustScore < 40) return 0;
  
  // Small boost: up to 10 points
  // Vendors with 100 score get full 10 points
  return (vendorScore / 100) * 10;
}