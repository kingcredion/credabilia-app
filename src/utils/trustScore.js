/**
 * Trust Score Utilities
 * 
 * Implements a dual-score trust system with dynamic weighting:
 * - Authenticator Score: Based on professional credentials, certificates, AI confidence
 * - Community Score: Based on weighted votes with baseline smoothing
 * - Final Trust Score: Dynamic weighted blend of both scores
 * 
 * Prevents single votes from swinging the meter dramatically
 */

// Trusted authenticator mapping (expandable)
const TRUSTED_AUTHENTICATORS = {
  'PSA': 95,
  'BGS': 95,
  'SGC': 95,
  'JSA': 90,
  'Beckett': 95,
  'Sothebys': 92,
  'Christies': 92,
  'eBay Authenticity Guarantee': 80,
};

/**
 * Calculate Authenticator Score
 * 
 * Formula:
 * - If trusted authenticator exists: use their score (85-95)
 * - Else if AI confidence exists: use it directly (0-100)
 * - Else use vendor credibility as light modifier (base 60)
 * 
 * @param {Object} item - Item record
 * @param {Object} vendor - Vendor user record (optional)
 * @returns {number} 0-100 score
 */
export function calculateAuthenticatorScore(item, vendor = null) {
  // Check for trusted authenticator
  if (item.authenticator) {
    const trustedScore = TRUSTED_AUTHENTICATORS[item.authenticator];
    if (trustedScore) {
      return trustedScore;
    }
  }

  // Fall back to AI confidence
  if (item.ai_confidence && item.ai_confidence > 0) {
    return Math.round(item.ai_confidence);
  }

  // Light vendor credibility modifier (only if no other signals)
  if (vendor?.vendor_credibility) {
    return Math.round(Math.min(70, 50 + (vendor.vendor_credibility * 0.2)));
  }

  // Neutral baseline
  return 60;
}

/**
 * Calculate Community Score with baseline smoothing
 * 
 * Prevents early votes from swinging the meter too much.
 * Uses a baseline + real votes formula.
 * 
 * Formula:
 * - baselineVotes = 5 (assumed neutral votes early)
 * - baselineScore = 50
 * - communityScore = ((authentic - counterfeit + baseline) / (total + baseline)) * 100
 * 
 * This keeps scores near 50 until sufficient real votes accumulate.
 * Counterfeit votes reduce the score appropriately.
 * 
 * @param {Array} votes - Array of vote objects with {vote_type, weight}
 * @returns {number} 0-100 score
 */
export function calculateCommunityScore(votes) {
  const BASELINE_VOTES = 5;
  const BASELINE_SCORE = 50;

  if (!votes || votes.length === 0) {
    return BASELINE_SCORE; // Neutral baseline
  }

  const authenticCount = votes.filter(v => v.vote_type === 'authentic').length;
  const counterfeitCount = votes.filter(v => v.vote_type === 'counterfeit').length;
  const suspiciousCount = votes.filter(v => v.vote_type === 'suspicious').length;

  // Weight votes by voter rank (already stored as weight)
  const authenticWeight = votes
    .filter(v => v.vote_type === 'authentic')
    .reduce((sum, v) => sum + (v.weight || 1), 0);

  const counterfeitWeight = votes
    .filter(v => v.vote_type === 'counterfeit')
    .reduce((sum, v) => sum + (v.weight || 1), 0);

  const totalWeight = votes.reduce((sum, v) => sum + (v.weight || 1), 0);

  // Apply baseline smoothing
  const netScore = authenticWeight - counterfeitWeight + BASELINE_VOTES;
  const totalVotes = totalWeight + BASELINE_VOTES;

  const communityScore = (netScore / totalVotes) * 100;

  return Math.round(Math.max(0, Math.min(100, communityScore)));
}

/**
 * Get dynamic weights based on total vote count
 * 
 * Weights shift from expert-heavy to community-heavy as more votes accumulate.
 * 
 * Thresholds:
 * - 0-9 votes: 80% authenticator, 20% community
 * - 10-24 votes: 65% authenticator, 35% community
 * - 25-99 votes: 50% authenticator, 50% community
 * - 100+ votes: 35% authenticator, 65% community
 * 
 * @param {number} totalVotes - Total number of votes
 * @returns {Object} { authenticatorWeight, communityWeight }
 */
export function getDynamicWeights(totalVotes) {
  if (totalVotes < 10) {
    return { authenticatorWeight: 0.8, communityWeight: 0.2 };
  }
  if (totalVotes < 25) {
    return { authenticatorWeight: 0.65, communityWeight: 0.35 };
  }
  if (totalVotes < 100) {
    return { authenticatorWeight: 0.5, communityWeight: 0.5 };
  }
  return { authenticatorWeight: 0.35, communityWeight: 0.65 };
}

/**
 * Calculate Final Trust Score
 * 
 * Combines authenticator and community scores with dynamic weighting.
 * 
 * Formula:
 * finalTrustScore = (authenticatorScore * weight_auth) + (communityScore * weight_comm)
 * 
 * @param {number} authenticatorScore - 0-100
 * @param {number} communityScore - 0-100
 * @param {number} totalVotes - Total votes for weighting
 * @returns {number} 0-100 final score
 */
export function calculateFinalTrustScore(
  authenticatorScore,
  communityScore,
  totalVotes
) {
  const { authenticatorWeight, communityWeight } = getDynamicWeights(totalVotes);

  const finalScore =
    authenticatorScore * authenticatorWeight +
    communityScore * communityWeight;

  return Math.round(Math.max(0, Math.min(100, finalScore)));
}

/**
 * Recalculate all trust scores for an item
 * 
 * This is the main entry point for updating item trust fields
 * after votes are submitted.
 * 
 * @param {Object} item - Item record with id, ai_confidence, authenticator
 * @param {Array} votes - Array of vote records
 * @param {Object} vendor - Vendor record (optional)
 * @returns {Object} { authenticator_score, community_score, final_trust_score, authenticator_weight, community_weight }
 */
export function recalculateItemTrust(item, votes = [], vendor = null) {
  const authenticatorScore = calculateAuthenticatorScore(item, vendor);
  const communityScore = calculateCommunityScore(votes);
  const totalVotes = votes ? votes.length : 0;
  const { authenticatorWeight, communityWeight } =
    getDynamicWeights(totalVotes);
  const finalTrustScore = calculateFinalTrustScore(
    authenticatorScore,
    communityScore,
    totalVotes
  );

  return {
    authenticator_score: authenticatorScore,
    community_score: communityScore,
    final_trust_score: finalTrustScore,
    authenticator_weight: Math.round(authenticatorWeight * 100),
    community_weight: Math.round(communityWeight * 100),
  };
}

/**
 * Get fallback score for old items without new trust fields
 * 
 * Ensures backward compatibility:
 * - If final_trust_score exists, use it
 * - Else if authenticity_meter exists, use it
 * - Else use ai_confidence or default 50
 * 
 * @param {Object} item - Item record
 * @returns {number} 0-100 score
 */
export function getFallbackTrustScore(item) {
  if (item.final_trust_score !== undefined && item.final_trust_score !== null) {
    return item.final_trust_score;
  }
  if (item.authenticity_meter !== undefined && item.authenticity_meter !== null) {
    return item.authenticity_meter;
  }
  if (item.ai_confidence !== undefined && item.ai_confidence !== null) {
    return item.ai_confidence;
  }
  return 50; // Neutral default
}