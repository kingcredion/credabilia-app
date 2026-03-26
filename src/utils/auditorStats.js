/**
 * Auditor Stats Updater
 *
 * Computes and writes the user-level fields that power the auditor leaderboard:
 *   - trust_score   (0-1) : blended accuracy + vote weight signal
 *   - accuracy_rate (0-1) : fraction of votes that match the item's final verdict
 *   - xp            (int) : total XP earned (already incremented at call site)
 *   - total_vets    (int) : lifetime audit count (already incremented at call site)
 *
 * Formula for trust_score:
 *   accuracy_weight = 0.7
 *   xp_weight       = 0.3
 *   normalizedXP    = min(1, xp / 500)
 *   trust_score     = accuracy_rate * 0.7 + normalizedXP * 0.3
 *
 * Formula for accuracy_rate:
 *   Compares each vote to the item's current audit_status or final_trust_score:
 *     - Vote is "accurate" if it matches the dominant community verdict on the item.
 *     - We use a simplified but consistent definition: authentic vote on a
 *       final_trust_score >= 60 item counts as accurate; counterfeit/suspicious
 *       vote on final_trust_score < 60 counts as accurate.
 *   Since we can't retroactively refetch all items efficiently on the client,
 *   we use an incremental Bayesian-style update:
 *     new_accuracy = (prior_accurate_count + isAccurate) / (total_vets)
 *
 * NOTE: accuracy_rate starts at 0.5 (neutral) for new auditors and converges
 * with more votes. This prevents gaming by single-audit users.
 *
 * Call updateAuditorStats() after every successful audit submission.
 */

import { base44 } from "@/api/base44Client";

/**
 * Determines if a vote is "accurate" relative to the item's current trust score.
 * Uses a conservative definition compatible with both VettingQueue and ItemDetails.
 *
 * @param {string} voteType - 'authentic' | 'suspicious' | 'counterfeit'
 * @param {Object} item - Item record with final_trust_score (or authenticity_meter as fallback)
 * @returns {boolean}
 */
export function isVoteAccurate(voteType, item) {
  const score = item.final_trust_score ?? item.authenticity_meter ?? 50;
  if (voteType === 'authentic') return score >= 60;
  if (voteType === 'suspicious') return score >= 30 && score < 70;
  if (voteType === 'counterfeit') return score < 40;
  return false;
}

/**
 * Recalculate and persist auditor-level stats after an audit submission.
 * Call this AFTER XP and total_vets have already been incremented.
 *
 * @param {Object} user - Current user record (with updated xp and total_vets)
 * @param {string} voteType - The vote that was just submitted
 * @param {Object} item - The item that was just voted on (with trust fields)
 */
export async function updateAuditorStats(user, voteType, item) {
  const newTotalVets = user.total_vets || 1; // already incremented at call site
  const newXP = user.xp || 0;               // already incremented at call site

  // Incremental accuracy update
  const prevAccuracy = user.accuracy_rate ?? 0.5;
  const prevAccurateCount = prevAccuracy * Math.max(1, newTotalVets - 1);
  const accurate = isVoteAccurate(voteType, item) ? 1 : 0;
  const newAccurateCount = prevAccurateCount + accurate;
  const newAccuracyRate = newAccurateCount / newTotalVets;

  // Blended trust score
  const normalizedXP = Math.min(1, newXP / 500);
  const newTrustScore = newAccuracyRate * 0.7 + normalizedXP * 0.3;

  // Derive rank from XP
  let rank = 'bronze';
  if (newXP >= 500) rank = 'gold';
  else if (newXP >= 200) rank = 'silver';

  await base44.auth.updateMe({
    accuracy_rate: Math.round(newAccuracyRate * 1000) / 1000, // 3dp precision
    trust_score: Math.round(newTrustScore * 1000) / 1000,
    rank,
  });
}