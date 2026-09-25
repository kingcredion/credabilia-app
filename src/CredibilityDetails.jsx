import React from 'react';
import { Check, ClipboardCheck, ArrowRight } from 'lucide-react';

// Reused on the marketplace grid card (compact, no label) and on the full item-credibility
// section below (full width, alongside the numeric breakdown already in the text around it).
// A custom gradient bar rather than the native <meter> -- <meter> can only band a value into
// low/high/optimum regions (rendered inconsistently across browsers), not a smooth 0-100
// red-to-green gradient.
export function CredibilityMeter({ score, compact }) {
  if (!Number.isFinite(score)) return null;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return <span className={compact ? 'credibility-meter compact' : 'credibility-meter'} role="img" aria-label={`Credibility score ${pct} out of 100`}>
    <span className="credibility-meter-track"><span className="credibility-meter-marker" style={{ left: `${pct}%` }}/></span>
    {compact && <span className="credibility-meter-num">{pct}</span>}
  </span>;
}

export default function CredibilityDetails({ item, session, own, auditedLabel, onAudit }) {
  if (!Number.isFinite(item.credibility_score)) return null;
  return <section className="evidence-box" aria-label="Item credibility">
    <h3>Item credibility · {item.credibility_score}/100</h3>
    <CredibilityMeter score={item.credibility_score}/>
    <p>{item.certificate_supplied ? `Issuer rating: ${item.certificate_score}/100` : 'No certificate provided'} · {item.certificate_weight}% of the score</p>
    <p>Community: {item.credibility_audit_count ? `${item.community_score}/100` : 'No audits yet'} · {item.community_weight}% of the score</p>
    {session && !own && (auditedLabel
      ? <p className="field-note"><Check size={14}/> You audited this — {auditedLabel}</p>
      : <button type="button" className="primary compact" onClick={onAudit}><ClipboardCheck size={16}/>Audit this item<ArrowRight size={16}/></button>)}
    <details><summary>How this score works</summary>
      <p>Credabilia combines the listed certificate issuer's rating with community assessments. Company ratings are Credabilia's product settings. Seller-provided certificate details have not been checked with the issuer by Credabilia.</p>
      <p>Community assessments start with five neutral baseline votes so one opinion has limited influence. Each assessment currently has equal weight. “Looks consistent” contributes 100, “Need more evidence” 50, and “I see concerns” 0.</p>
      <p>Certificate/community weighting is 80/20 for fewer than 10 audits, 65/35 for 10–24, 50/50 for 25–99, and 35/65 for 100 or more. A missing certificate scores 25 out of 100 on the certificate side — a real reflection of no evidence provided, not a neutral placeholder.</p>
      <p>When a seller gets an AI opinion on a signature close-up, it adjusts the certificate side by a small, capped amount — +5 if the opinion is "consistent," −15 if it flags "concerns," no change if "inconclusive" or not submitted. This is a plain-language opinion, not a forensic or certain authentication, and it improves as Credabilia's own signature library grows over time.</p>
      <p>This is an evidence and opinion score, not a probability of authenticity. Participation XP does not change an audit's weight.</p>
    </details>
  </section>;
}
