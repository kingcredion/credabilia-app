import React, { useEffect, useState } from 'react';
import './founding.css';

const day = value => value ? new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—';

// Staff-only view of the Founding 100 campaign: who was invited, who claimed, and the exact dates. Everything comes from operator-only database functions.
export function AdminFounding({ service }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [rows, setRows] = useState(null);
  async function load() { setError(''); try { setData(await service.adminFoundingOverview()); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
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
    </div>
    <h3>Founding sellers</h3>
    {data.members.length === 0 ? <p className="field-note">No one has claimed a spot yet.</p>
      : <div className="table-scroll"><table><thead><tr><th>Spot</th><th>Seller</th><th>Claimed</th></tr></thead><tbody>
        {data.members.map(m => <tr key={m.user_id}><td>{m.spot_number}</td><td>{m.name || 'Member'}</td><td>{day(m.claimed_at)}</td></tr>)}
      </tbody></table></div>}
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
