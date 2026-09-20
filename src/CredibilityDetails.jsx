import React from 'react';

export default function CredibilityDetails({ item }) {
  if (!Number.isFinite(item.credibility_score)) return null;
  const hasSignal=item.certificate_supplied || item.credibility_audit_count>0;
  return <section className="evidence-box" aria-label="Item credibility">
    <h3>Item credibility · {hasSignal ? `${item.credibility_score}/100` : 'Awaiting evidence'}</h3>
    {hasSignal && <meter min="0" max="100" value={item.credibility_score} aria-label="Item credibility score" style={{width:'100%'}}/>}
    <p>{item.certificate_supplied ? `Issuer rating: ${item.certificate_score}/100` : 'Certificate: neutral baseline, no details supplied'} · {item.certificate_weight}% of the score</p>
    <p>Community: {item.credibility_audit_count ? `${item.community_score}/100` : 'neutral baseline, no audits yet'} · {item.community_weight}% of the score</p>
    <details><summary>How this score works</summary>
      <p>Credabilia combines the listed certificate issuer's rating with community assessments. Company ratings are Credabilia's product settings. Seller-provided certificate details have not been checked with the issuer by Credabilia.</p>
      <p>Community assessments start with five neutral baseline votes so one opinion has limited influence. Each assessment currently has equal weight. “Looks consistent” contributes 100, “Need more evidence” 50, and “I see concerns” 0.</p>
      <p>Certificate/community weighting is 80/20 for fewer than 10 audits, 65/35 for 10–24, 50/50 for 25–99, and 35/65 for 100 or more. A missing certificate uses a neutral 50-point baseline.</p>
      <p>This is an evidence and opinion score, not a probability of authenticity. Participation XP does not change an audit's weight.</p>
    </details>
  </section>;
}
