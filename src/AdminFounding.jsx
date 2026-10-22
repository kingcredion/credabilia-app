import React, { useEffect, useState } from 'react';
import { approvalMailto } from './founding.js';
import './founding.css';

const day = value => value ? new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—';

// Staff-only view of the Founding 100 campaign: who was invited, who claimed, and the exact dates. Everything comes from operator-only database functions.
export function AdminFounding({ service }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [rows, setRows] = useState(null);
  const [requests, setRequests] = useState(null), [approved, setApproved] = useState(null);
  async function load() { setError(''); try { setData(await service.adminFoundingOverview()); } catch (err) { setError(err.message); } }
  async function loadRequests() { try { setRequests(await service.adminFoundingRequests('pending')); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); loadRequests(); }, []);
  // Approving only adds the email to the invitation list. The person is not told automatically, so a ready-to-send email is offered right after.
  async function decide(request, approve) {
    if (!window.confirm(approve ? `Approve ${request.business_name}? This adds ${request.email} to the invitation list.` : `Decline ${request.business_name}?`)) return;
    setBusy(true); setError(''); setApproved(null);
    try { await service.adminDecideFoundingRequest(request.id, approve); if (approve) setApproved(request); await Promise.all([load(), loadRequests()]); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function find(event) {
    event?.preventDefault(); setError('');
    try { setRows(await service.adminFoundingInvitations(search)); } catch (err) { setError(err.message); }
  }
  async function start() {
    if (!window.confirm('Start the Founding 100 window now? The 90 days begin immediately and cannot be restarted.')) return;
    setBusy(true); setError('');
    try { await service.adminStartFounding(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!data) return <p role="status">{error || 'Loading…'}</p>;
  const state = data.closed_reason === 'full' ? 'Closed: all spots claimed' : data.closed_reason === 'expired' ? 'Closed: window ended' : data.started_at ? 'Open' : 'Not started';
  return <div className="admin-founding">
    <h2>Founding 100</h2>
    {error && <p role="alert" className="error">{error}</p>}
    <p><strong>{state}.</strong> Started {day(data.started_at)}. {data.expires_at ? <>Invitations expire <strong>{day(data.expires_at)}</strong>.</> : <>The {data.window_days}-day window starts when you press the button below.</>}</p>
    {!data.started_at && <p><button type="button" className="primary" disabled={busy} onClick={start}>Start the {data.window_days}-day window</button></p>}
    <div className="stat-row">
      <div className="stat"><strong>{data.invitations_loaded}</strong><span>Invitations saved</span></div>
      <div className="stat"><strong>{data.invitations_open}</strong><span>Still open</span></div>
      <div className="stat"><strong>{data.claimed}</strong><span>Claimed</span></div>
      <div className="stat"><strong>{data.spots_left}</strong><span>Spots left of {data.spot_limit}</span></div>
      <div className="stat"><strong>{data.removed_unclaimed}</strong><span>Unclaimed, deleted</span></div>
      <div className="stat"><strong>{data.requests_pending ?? 0}</strong><span>Requests to review</span></div>
    </div>
    <h3>Requests to review</h3>
    <p className="field-note">People who asked for an invitation on the Founding page. Approving adds their email to the invitation list so they can claim a spot. It does not email them.</p>
    {approved && <div className="founding-box ok" role="status"><p><strong>{approved.business_name} is approved.</strong> Let them know:</p>
      <p><a href={approvalMailto(approved)}>Email {approved.contact_name}</a></p></div>}
    {requests === null ? <p role="status">Loading…</p> : requests.length === 0 ? <p className="field-note">No requests are waiting.</p>
      : <div className="table-scroll"><table><thead><tr><th>Shop</th><th>Contact</th><th>Link</th><th>Sells</th><th>Heard from</th><th>Asked</th><th></th></tr></thead><tbody>
        {requests.map(r => <tr key={r.id}><td>{r.business_name}</td><td>{r.contact_name}<br/>{r.email}</td>
          <td className="founding-request-note">{/^https?:\/\//i.test(r.store_link || '') ? <a href={r.store_link} target="_blank" rel="noreferrer noopener">{r.store_link}</a> : (r.store_link || '—')}</td>
          <td className="founding-request-note">{r.what_they_sell || '—'}</td><td className="founding-request-note">{r.how_heard || '—'}</td><td>{day(r.created_at)}</td>
          <td><div className="founding-actions"><button type="button" className="primary compact" disabled={busy} onClick={() => decide(r, true)}>Approve</button><button type="button" className="text-button" disabled={busy} onClick={() => decide(r, false)}>Decline</button></div></td></tr>)}
      </tbody></table></div>}
    <h3>Founding sellers</h3>
    {data.members.length === 0 ? <p className="field-note">No one has claimed a spot yet.</p>
      : <div className="table-scroll"><table><thead><tr><th>Spot</th><th>Seller</th><th>Account email</th><th>Signs in with</th><th>Claimed</th></tr></thead><tbody>
        {data.members.map(m => <tr key={m.user_id}><td>{m.spot_number}</td><td>{m.name || 'Member'}</td><td>{m.email || '—'}{m.apple_hidden_email && <> <strong>Apple hidden email</strong></>}</td><td>{(m.providers || []).join(', ') || '—'}</td><td>{day(m.claimed_at)}</td></tr>)}
      </tbody></table></div>}
    {data.members.some(m => !(m.providers || []).includes('apple')) && data.members.length > 0 && <p className="field-note">A founder who later signs in on the phone with Sign in with Apple and hides their email gets a separate new account without the benefit. Remind founders to sign in the same way they did on the website.</p>}
    <h3>Open invitations</h3>
    <form onSubmit={find} className="submit-row">
      <label>Find by shop, name, phone or email<input value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. Cards"/></label>
      <button className="primary compact">Search</button>
    </form>
    <p className="field-note">Private: only staff can see this list. It is used for phone calls and deleted when the window ends or the spots run out.</p>
    {rows && (rows.length === 0 ? <p className="field-note">No open invitation matches.</p>
      : <div className="table-scroll"><table><thead><tr><th>Shop</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.email}><td>{r.business_name || '—'}</td><td>{r.contact_name || '—'}</td><td>{r.phone || '—'}</td><td>{r.email}</td></tr>)}
      </tbody></table></div>)}
  </div>;
}
