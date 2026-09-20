import React, { useState } from 'react';
import { DETAIL_FIELDS } from './listingDetails.js';

const LABELS = { authentic: 'Looks consistent', uncertain: 'Need more evidence', concerns: 'I see concerns' };

export function ItemHistory({ item, service }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  if (!item.version || item.version <= 1) return null;
  async function toggle(event) {
    const expanded = event.target.open;
    setOpen(expanded);
    if (expanded && !history) {
      try { setHistory(await service.getListingHistory(item.id)); }
      catch (err) { setError(err.message); }
    }
  }
  return <details className="evidence-box" onToggle={toggle}>
    <summary>Item history · revised {item.version - 1} {item.version - 1 === 1 ? 'time' : 'times'}</summary>
    <p className="field-note">Earlier versions and the reviews they received stay visible here, even after the seller made changes. The current score only reflects reviews of the current version.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {open && !history && !error && <p role="status">Loading history…</p>}
    {history?.map(version => <div key={version.version} className="recorded">
      <div>
        <strong>Version {version.version} · revised {new Date(version.archived_at).toLocaleDateString()}</strong>
        <p><strong>{version.title}</strong> · {version.category}</p>
        <p>{version.description}</p>
        {version.evidence && <p className="field-note">Evidence at the time: {version.evidence}</p>}
        {version.certificate_issuer && <p className="field-note">Certificate: {version.certificate_issuer} · {version.certificate_number}</p>}
        {!!Object.keys(version.attributes || {}).length && <p className="field-note">{Object.entries(version.attributes).map(([key, value]) => `${DETAIL_FIELDS[key] || key}: ${value}`).join(' · ')}</p>}
        {version.audits.length ? <ul>{version.audits.map((audit, i) => <li key={i}>{LABELS[audit.verdict] || audit.verdict} · {audit.explanation}</li>)}</ul> : <p className="field-note">No reviews were recorded for this version.</p>}
      </div>
    </div>)}
  </details>;
}
