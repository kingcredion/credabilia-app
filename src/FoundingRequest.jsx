import React, { useState } from 'react';
import { trackEvent } from './events.js';
import './founding.css';

// "Request a Founding invitation": for people who land on /founding (for example from an ad) and were not on the invitation list. Nothing here grants anything.
// The request goes to staff, who approve by hand; an approval only adds the email to the invitation list, and the person then claims it the normal way.
export function FoundingRequestForm({ service, defaultEmail = '' }) {
  const [fields, setFields] = useState({ email: defaultEmail, name: '', business: '', link: '', sells: '', heard: '', website: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const set = key => event => setFields({ ...fields, [key]: event.target.value });
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await service.requestFoundingInvitation(fields); setDone(true); trackEvent('founding_request'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  if (done) return <div className="founding-box ok" role="status"><h3>Request received</h3>
    <p>Thank you. We read every request and approve sellers by hand. If we approve yours, we'll email <strong>{fields.email}</strong> with the next step, and you'll claim your spot by signing in with that same email address.</p></div>;
  return <form className="founding-box founding-request" onSubmit={submit}>
    <h3>Request a Founding invitation</h3>
    <p className="field-note">Tell us a little about you and what you sell. We approve sellers by hand, so spots go to real collectors and shops. There's no cost to ask, and approval isn't guaranteed.</p>
    <label>Your name<input value={fields.name} onChange={set('name')} maxLength={100} autoComplete="name" required/></label>
    <label>Shop or business name<input value={fields.business} onChange={set('business')} maxLength={120} autoComplete="organization" required/></label>
    <label>Email<input type="email" value={fields.email} onChange={set('email')} maxLength={254} autoComplete="email" required/></label>
    <label>Your store or social link <span className="field-note">(optional)</span><input value={fields.link} onChange={set('link')} maxLength={300} placeholder="eBay, Instagram or your website"/></label>
    <label>What do you sell? <span className="field-note">(optional)</span><textarea value={fields.sells} onChange={set('sells')} maxLength={500} rows={3} placeholder="For example: signed baseballs, vintage cards, jerseys"/></label>
    <label>How did you hear about us? <span className="field-note">(optional)</span><input value={fields.heard} onChange={set('heard')} maxLength={200}/></label>
    <label className="founding-hp" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={fields.website} onChange={set('website')}/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button type="submit" className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send my request'}</button>
    <p className="field-note">We use these details only to review your request, under our <a href="/privacy">Privacy Policy</a>, and delete them when the Founding 100 closes. Founding sellers pay no Credabilia selling fees for as long as their account stays open and in good standing. Payment-processing fees still apply.</p>
  </form>;
}
