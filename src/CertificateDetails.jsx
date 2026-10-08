import React, { useState } from 'react';
import { Copy, Award } from 'lucide-react';
import { ISSUERS, resolveIssuer } from './certificates.js';

export function CertificateFields({value,onChange,disabled=false}) {
  const issuer=value.certificate_issuer || '';
  const update=(key,text)=>onChange({...value,[key]:text});
  return <fieldset className="form-stack" disabled={disabled}><legend>Certificate details · optional</legend>
    <label>Issuing company<select name="certificate_issuer" value={issuer} onChange={event=>onChange({certificate_issuer:event.target.value,certificate_number:'',certificate_company:''})}><option value="">No certificate</option>{ISSUERS.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
    {issuer==='fiterman' && <p className="field-note">Fiterman Sports does not use certificate numbers, so there is no number to enter. Buyers are told this, and the score reflects that there is no certificate record to check.</p>}
    {issuer && issuer!=='fiterman' && <>
      {issuer==='other' && <label>Company name<input name="certificate_company" value={value.certificate_company || ''} onChange={event=>update('certificate_company',event.target.value)} required minLength={2} maxLength={100}/></label>}
      <label>Certificate number<input name="certificate_number" value={value.certificate_number || ''} onChange={event=>update('certificate_number',event.target.value)} required maxLength={80} autoComplete="off" placeholder="Exactly as printed on the certificate"/></label>
      <p className="field-note">Buyers can use these details to check the issuer's records. Confirm the company and number before publishing.</p>
    </>}
  </fieldset>;
}

export default function CertificateDetails({item}) {
  const [message,setMessage]=useState('');
  const issuer=resolveIssuer(item.certificate_issuer);
  if (issuer?.noNumber) return <section className="evidence-box" aria-label="Certificate details">
    <h3><Award size={18}/>Certificate details</h3><p><strong>{issuer.name}</strong></p>
    <p>{issuer.name} does not use certificate numbers, so there is no certificate record attached that you can look up.</p>
    <p className="field-note">This does not mean the item is not authentic. It only means there is no certificate number with a record to check, so the credibility score is lower than it would be for an item with a numbered, checkable certificate. Provided by the seller.</p>
  </section>;
  if (!issuer || !item.certificate_number) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(item.certificate_number); setMessage('Certificate number copied.'); }
    catch { setMessage('Select the certificate number above and copy it manually.'); }
  }
  return <section className="evidence-box" aria-label="Certificate details">
    <h3><Award size={18}/>Certificate details</h3><p><strong>{issuer.id==='other'?item.certificate_company:issuer.name}</strong></p>
    <p>Certificate number: <code>{item.certificate_number}</code></p>
    <p className="field-note">Provided by the seller. Compare the issuer's record with the item and its certificate.</p>
    <div className="submit-row"><button type="button" className="text-button certificate-copy" onClick={copy}><Copy size={15}/>Copy certificate number</button>
      {issuer.lookup && <a className="primary compact" href={issuer.lookup} target="_blank" rel="noopener noreferrer">Look up this certificate ↗</a>}
    </div>
    {!issuer.lookup && <p className="field-note">An official lookup link hasn't been added for this issuer yet.</p>}
    {message && <p role="status">{message}</p>}
    <p className="field-note">The lookup opens the issuer's search page. Enter the certificate number there.</p>
    {issuer.id!=='other' && <p className="field-note"><a href={`/certificate?issuer=${encodeURIComponent(issuer.id)}&number=${encodeURIComponent(item.certificate_number)}`}>Check this number in Credabilia's records ↗</a> — see whether it appears on any other listing.</p>}
  </section>;
}
