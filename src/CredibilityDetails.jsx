import React from 'react';
import { Check, ClipboardCheck, ArrowRight, Crown, Gauge } from 'lucide-react';
import { OUTAGE_NOTE, resolveIssuer } from './certificates.js';
import { credibilityTier } from './credibility.js';

// Two looks for one score. On a marketplace card it is a half gauge with the number inside (compact); on the item page it is five crowns with a plain-word tier.
// The words say how much evidence there is (Limited, Fair, Strong), never that an item is or is not authentic: Credabilia does not authenticate items.

const tierClass = score => (score < 40 ? 'low' : score < 70 ? 'mid' : 'high');

export function CredibilityMeter({ score, compact }) {
  if (!Number.isFinite(score)) return null;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const label = `Credibility score ${pct} out of 100, ${credibilityTier(pct).toLowerCase()} evidence`;
  if (compact) return <span className={`credibility-gauge ${tierClass(pct)}`} role="img" aria-label={label}>
    <svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true"><path className="gauge-track" d="M8 34 A24 24 0 0 1 56 34"/><path className="gauge-fill" d="M8 34 A24 24 0 0 1 56 34" pathLength="100" strokeDasharray={`${pct} 100`}/></svg>
    <span className="gauge-num">{pct}</span>
  </span>;
  const crowns = Math.max(0, Math.min(5, Math.round(pct / 20)));
  return <span className={`credibility-crowns ${tierClass(pct)}`} role="img" aria-label={label}>
    <span className="crown-row" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <Crown key={i} size={24} className={i <= crowns ? 'crown-on' : 'crown-off'}/>)}</span>
    <span className="crown-word">{credibilityTier(pct)} evidence</span>
  </span>;
}

// Who the issuer is and how we arrived at its rating, for issuers whose certificates we cannot look up. Open on the page, not hidden: this is the explanation buyers need.
function IssuerProfile({ issuer }) {
  const { profile } = issuer;
  return <div className="issuer-profile" role="group" aria-label={'About ' + issuer.name}>
    <h4>About the issuer: {issuer.name}</h4>
    <p className="field-note">{profile.summary}</p>
    <h5>What we looked at</h5>
    <ul className="field-note">{profile.looked.map(line => <li key={line}>{line}</li>)}</ul>
    <h5>What we could not check</h5>
    <ul className="field-note">{profile.couldnt.map(line => <li key={line}>{line}</li>)}</ul>
    <p className="field-note"><strong>Why this rating.</strong> {profile.why}</p>
    <p className="field-note"><a href={issuer.website} target="_blank" rel="noopener noreferrer">{issuer.name} website ↗</a> · <a href={issuer.authenticityPage} target="_blank" rel="noopener noreferrer">How they describe their authentication ↗</a></p>
  </div>;
}

export default function CredibilityDetails({ item, session, own, auditedLabel, onAudit }) {
  if (!Number.isFinite(item.credibility_score)) return null;
  return <section className="evidence-box" aria-label="Item credibility">
    <h3><Gauge size={18}/>Item credibility · {item.credibility_score}/100</h3>
    <CredibilityMeter score={item.credibility_score}/>
    <p>{item.certificate_supplied ? `Issuer rating: ${item.certificate_score}/100` : 'No certificate provided'} · {item.certificate_weight}% of the score</p>
    {item.certificate_checked_at && <p className="field-note"><Check size={14}/> Checked with the issuer — a Credabilia operator confirmed this certificate with the issuer on {new Date(item.certificate_checked_at).toLocaleDateString()}.</p>}
    {item.certificate_supplied && item.certificate_number && !item.certificate_checked_at && <p className="field-note">The certificate number was entered by the seller and has not been checked with the issuer yet, so it counts at 75% of the issuer's rating.</p>}
    {item.certificate_supplied && item.certificate_number && !item.certificate_checked_at && !resolveIssuer(item.certificate_issuer)?.noLookup && resolveIssuer(item.certificate_issuer)?.outage && <p className="field-note" role="note">{OUTAGE_NOTE}</p>}
    <p>Community: {item.credibility_audit_count ? `${item.community_score}/100` : 'No audits yet'} · {item.community_weight}% of the score</p>
    {resolveIssuer(item.certificate_issuer)?.profile && <IssuerProfile issuer={resolveIssuer(item.certificate_issuer)}/>}
    {item.certificate_issuer==='fiterman'
      ? <p className="field-note authenticity-note">Fiterman Sports does not use certificate numbers, so there is no certificate record to check. This score does not mean the item is not authentic; it only reflects that there is no certificate number with a record attached.</p>
      : item.certificate_issuer==='frameworth'
      ? <p className="field-note authenticity-note">Credabilia does not authenticate items. Compare the certificate and hologram with the item, read about the company above, and ask the seller anything the listing leaves out.</p>
      : item.certificate_supplied
      ? <p className="field-note authenticity-note">The seller entered this item's certificate details. Credabilia has not checked them with the issuer and does not authenticate items — use the issuer's lookup link to check the certificate yourself.</p>
      : <p className="field-note authenticity-note">No certificate of authenticity was provided for this item. Credabilia does not authenticate items — review the photos, the score and the evidence notes before you buy.</p>}
    {session && !own && (auditedLabel
      ? <p className="field-note"><Check size={14}/> You audited this — {auditedLabel}</p>
      : <button type="button" className="primary compact" onClick={onAudit}><ClipboardCheck size={16}/>Audit this item<ArrowRight size={16}/></button>)}
    <details><summary>How this score works</summary>
      <p>Credabilia combines the listed certificate issuer's rating with community assessments. Company ratings are Credabilia's product settings. A seller-entered certificate number counts at 75% of the issuer's rating until a Credabilia operator confirms it with the issuer, after which it counts in full and the item is marked "Checked with the issuer". An issuer with no public lookup, such as Frameworth Sports Marketing, has nothing to confirm a number against, so its rating (65) is already set a little lower and its numbers count in full.</p>
      <p>Community assessments start with five neutral baseline votes so one opinion has limited influence. Each assessment currently has equal weight. “Looks consistent” contributes 100, “Need more evidence” 50, and “I see concerns” 0.</p>
      <p>Certificate/community weighting is 80/20 for fewer than 10 audits, 65/35 for 10–24, 50/50 for 25–99, and 35/65 for 100 or more. Some issuers, such as Fiterman Sports, do not use certificate numbers; a listing that names one is scored lower because there is no record to check, which says nothing about whether the item is authentic. A missing certificate scores 25 out of 100 on the certificate side — a real reflection of no evidence provided, not a neutral placeholder.</p>
      <p>When King Credion gives an opinion on a signature close-up, it adjusts the certificate side by a small, capped amount — +5 if the opinion is "consistent," −15 if it flags "concerns," no change if "inconclusive" or not submitted. This is a plain-language opinion, not a forensic or certain authentication, and it gets smarter as Credabilia's own library of verified signatures grows over time.</p>
      <p>This is an evidence and opinion score, not a probability of authenticity. Participation XP does not change an audit's weight.</p>
    </details>
  </section>;
}
