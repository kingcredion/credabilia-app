import React from 'react';
import { Check, ClipboardCheck, ArrowRight, Gauge } from 'lucide-react';

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
    <h3><Gauge size={18}/>Item credibility · {item.credibility_score}/100</h3>
    <CredibilityMeter score={item.credibility_score}/>
    <p>{item.certificate_supplied ? `Issuer rating: ${item.certificate_score}/100` : 'No certificate provided'} · {item.certificate_weight}% of the score</p>
    <p>Community: {item.credibility_audit_count ? `${item.community_score}/100` : 'No audits yet'} · {item.community_weight}% of the score</p>
    {item.certificate_issuer==='fiterman'
      ? <p className="field-note authenticity-note">Fiterman Sports does not use certificate numbers, so there is no certificate record to check. This score does not mean the item is not authentic; it only reflects that there is no certificate number with a record attached.</p>
      : item.certificate_supplied
      ? <p className="field-note authenticity-note">The seller entered this item's certificate details. Credabilia has not checked them with the issuer and does not authenticate items — use the issuer's lookup link to check the certificate yourself.</p>
      : <p className="field-note authenticity-note">No certificate of authenticity was provided for this item. Credabilia does not authenticate items — review the photos, the score and the evidence notes before you buy.</p>}
    {session && !own && (auditedLabel
      ? <p className="field-note"><Check size={14}/> You audited this — {auditedLabel}</p>
      : <button type="button" className="primary compact" onClick={onAudit}><ClipboardCheck size={16}/>Audit this item<ArrowRight size={16}/></button>)}
    <details><summary>How this score works</summary>
      <p>Credabilia combines the listed certificate issuer's rating with community assessments. Company ratings are Credabilia's product settings. Seller-provided certificate details have not been checked with the issuer by Credabilia.</p>
      <p>Community assessments start with five neutral baseline votes so one opinion has limited influence. Each assessment currently has equal weight. “Looks consistent” contributes 100, “Need more evidence” 50, and “I see concerns” 0.</p>
      <p>Certificate/community weighting is 80/20 for fewer than 10 audits, 65/35 for 10–24, 50/50 for 25–99, and 35/65 for 100 or more. Some issuers, such as Fiterman Sports, do not use certificate numbers; a listing that names one is scored lower because there is no record to check, which says nothing about whether the item is authentic. A missing certificate scores 25 out of 100 on the certificate side — a real reflection of no evidence provided, not a neutral placeholder.</p>
      <p>When King Credion gives an opinion on a signature close-up, it adjusts the certificate side by a small, capped amount — +5 if the opinion is "consistent," −15 if it flags "concerns," no change if "inconclusive" or not submitted. This is a plain-language opinion, not a forensic or certain authentication, and it gets smarter as Credabilia's own library of verified signatures grows over time.</p>
      <p>This is an evidence and opinion score, not a probability of authenticity. Participation XP does not change an audit's weight.</p>
    </details>
  </section>;
}
