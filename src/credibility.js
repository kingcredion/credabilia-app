import { resolveIssuer } from './certificates.js';

export function credibilityScore(item, audits = []) {
  const scores = { authentic:100, uncertain:50, concerns:0 };
  const valid = audits.filter(audit => Object.hasOwn(scores,audit.verdict));
  const count = valid.length;
  const certificateWeight = count<10 ? 80 : count<25 ? 65 : count<100 ? 50 : 35;
  const issuer = resolveIssuer(item.certificate_issuer);
  const supplied = Boolean(issuer && item.certificate_number);
  // An absent certificate is a real signal (the seller chose not to provide one), not the same
  // as "not enough data yet" -- so it drags the score down rather than landing on a neutral 50.
  // The AI signature opinion is folded in here as a small, capped modifier -- deliberately
  // conservative (an opinion shouldn't swing the score the way a real audit or certificate does),
  // and a no-op when no signature was submitted. Kept in lockstep with browse_scored_listings()
  // in 202609300048_signature_credibility_blend.sql.
  const signatureModifier = { consistent:5, concerns:-15 }[item.signature_ai_label] || 0;
  const certificateScore = Math.max(0, Math.min(100, (supplied ? issuer.rating : 25) + signatureModifier));
  const communityScore = Math.round((250+valid.reduce((sum,audit)=>sum+scores[audit.verdict],0))/(5+count));
  return {
    certificate_score:certificateScore, community_score:communityScore,
    certificate_weight:certificateWeight, community_weight:100-certificateWeight,
    credibility_score:Math.round((certificateScore*certificateWeight+communityScore*(100-certificateWeight))/100),
    credibility_audit_count:count, certificate_supplied:supplied,
  };
}
