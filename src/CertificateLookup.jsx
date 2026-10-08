import React, { useEffect, useState } from 'react';
import { Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand.jsx';
import { LegalNav } from './Legal.jsx';
import { LOOKUP_ISSUERS, resolveIssuer } from './certificates.js';

// A public page (no sign-in): enter an issuer and a certificate number and see whether it is recorded on a Credabilia listing, and how many.
// It confirms the number exists in Credabilia's own records. It does not say the issuer verified the certificate.
export function CertificateLookupPage({ service }) {
  const params = new URLSearchParams(window.location.search);
  const [issuer, setIssuer] = useState(LOOKUP_ISSUERS.some(entry => entry.id === params.get('issuer')) ? params.get('issuer') : '');
  const [number, setNumber] = useState(params.get('number') || '');
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function lookup(event) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await service.lookupCertificate(issuer, number.trim())); }
    catch (err) { setError(err.message || 'The lookup is unavailable right now. Try again shortly.'); }
    finally { setBusy(false); }
  }
  // A link from an item page arrives with the issuer and number filled in: run it straight away.
  useEffect(() => { if (issuer && number) lookup(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = resolveIssuer(issuer);
  return <div className="legal-page">
    <LegalNav current="certificate"/>
    <a className="legal-back brand" href="/"><Brand/></a>
    <h1>Certificate lookup</h1>
    <p className="legal-updated">Check whether a certificate number is recorded on a Credabilia listing.</p>
    <form className="form-stack" onSubmit={lookup}>
      <label>Issuing company<select value={issuer} onChange={event => { setIssuer(event.target.value); setResult(null); }} required>
        <option value="">Choose the issuer</option>{LOOKUP_ISSUERS.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></label>
      <label>Certificate number<input value={number} onChange={event => { setNumber(event.target.value); setResult(null); }} required maxLength={80} autoComplete="off" placeholder="Exactly as printed on the certificate"/></label>
      <button className="primary" disabled={busy || !issuer || !number.trim()}><Search size={16}/>{busy ? 'Checking…' : 'Look up'}</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {result && (result.found
      ? <div className="evidence-box" role="status">
          <h3>{result.count > 1 ? <ShieldAlert size={18}/> : <ShieldCheck size={18}/>}Recorded on {result.count} Credabilia {result.count === 1 ? 'listing' : 'listings'}</h3>
          <ul>{result.listings.map(listing => <li key={listing.id}>{listing.status === 'Sold' ? <span>{listing.title}</span> : <a href={`/item/${listing.id}`}>{listing.title}</a>} — {listing.status}, listed {new Date(listing.listed_at).toLocaleDateString()}</li>)}</ul>
          {result.count > 1 && <p className="error" role="alert">This number appears on more than one listing. A genuine certificate belongs to one item, so treat this as a warning sign and ask the seller to explain.</p>}
        </div>
      : <div className="evidence-box" role="status">
          <h3>Not found in Credabilia's records</h3>
          <p>No Credabilia listing carries this certificate number. That does not mean the certificate is fake: the item may simply not be listed here.</p>
        </div>)}
    {result && chosen?.lookup && <p><a className="primary compact" href={chosen.lookup} target="_blank" rel="noopener noreferrer">Check with {chosen.name} ↗</a></p>}
    <p className="field-note">This tool confirms whether a number appears in Credabilia's own records. It does not mean the issuer has verified the certificate, and Credabilia does not authenticate items. Where the issuer has its own lookup, use it too. Some issuers, such as Fiterman Sports, do not use certificate numbers at all.</p>
    <LegalNav current="certificate" footer/>
  </div>;
}
