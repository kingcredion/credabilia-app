/**
 * Marketplace Ranking System
 * 
 * Layers engagement + conversion signals on top of existing trust system.
 * Does NOT modify trust calculation or audit logic.
 */

import { calculateVendorQualityScore } from './vendorReputation';

/**
 * Calculate marketplace ranking score for an item.
 * 
 * Inputs:
 * - final_trust_score (0-100): primary signal from audit system
 * - total_votes (number): count of audit votes
 * - like_count (number): user likes
 * - conversion_count (number): purchases
 * - referral_conversion_count (number): referral-driven purchases
 * - created_date (ISO string or Date): for recency boost
 * - vendor (object, optional): vendor data for quality boost
 * 
 * Returns ranking_score (0-100) for sorting.
 * 
 * Weights (intentionally simple + stable):
 * - Trust is strongest signal (~60%)
 * - Engagement (likes, conversions) adds modest boost (~30%)
 * - Vendor reputation adds small bridge (~5-10%)
 * - Recency adds small temporary lift (~5%)
 */
export function calculateRankingScore(item, vendor = null) {
  // Extract inputs with safe defaults
  const trustScore = item.final_trust_score ?? item.authenticity_meter ?? 50;
  const totalVotes = item.total_votes ?? 0;
  const likeCount = item.like_count ?? 0;
  const conversionCount = item.conversion_count ?? 0;
  const referralConversionCount = item.referral_conversion_count ?? 0;
  const createdDate = item.created_date ? new Date(item.created_date) : new Date();

  // 1. Trust signal (60%) — primary driver
  // Low trust = low rank, regardless of engagement
  const trustWeight = 0.6;
  const trustComponent = (trustScore / 100) * trustWeight;

  // 2. Vote confidence boost (15%)
  // More votes = more confidence in the trust score
  const voteBoost = Math.min(totalVotes / 20, 1) * 0.15; // Saturates at 20 votes

  // 3. Engagement signal (15%)
  // Likes + conversions boost ranking
  const engagementScore = Math.min((likeCount + conversionCount * 2) / 10, 1) * 0.15;

  // 4. Referral conversion boost (5%)
  // Influencer-driven sales get extra boost
  const referralBoost = Math.min(referralConversionCount / 5, 1) * 0.05;

  // 5. Vendor reputation boost (5-10%, conditional)
  // Only applies if trust score is reasonable (>40)
  // Bridges vendor performance to ranking without overriding trust
  let vendorBoost = 0;
  if (vendor && trustScore > 40) {
    const vendorScore = calculateVendorQualityScore(vendor);
    vendorBoost = (vendorScore / 100) * 0.1; // Max 10%
  }

  // 6. Recency boost (small, temporary)
  // New items get tiny boost that fades after 30 days
  const daysOld = (Date.now() - createdDate) / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(0, (1 - daysOld / 30) * 0.05); // Fades over 30 days

  // Combine all signals
  const score =
    (trustComponent + voteBoost + engagementScore + referralBoost + vendorBoost + recencyBoost) * 100;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Recalculate and update ranking_score on an item.
 * Call this after trust updates, likes, conversions, referrals.
 * 
 * Returns an object with ranking_score to spread into an entity update.
 */
export function updateItemRanking(item, vendor = null) {
  return { ranking_score: calculateRankingScore(item, vendor) };
}

/**
 * Alias used by ItemDetails.jsx and VettingQueue.jsx.
 * Returns { ranking_score } ready to spread into an Item.update() call.
 */
export function updateMarketplaceRanking(item, vendor = null) {
  return updateItemRanking(item, vendor);
}