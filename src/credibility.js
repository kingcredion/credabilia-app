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
  const certificateScore = supplied ? issuer.rating : 25;
  const communityScore = Math.round((250+valid.reduce((sum,audit)=>sum+scores[audit.verdict],0))/(5+count));
  return {
    certificate_score:certificateScore, community_score:communityScore,
    certificate_weight:certificateWeight, community_weight:100-certificateWeight,
    credibility_score:Math.round((certificateScore*certificateWeight+communityScore*(100-certificateWeight))/100),
    credibility_audit_count:count, certificate_supplied:supplied,
  };
}
