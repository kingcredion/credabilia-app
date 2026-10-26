import React, { useEffect, useState } from 'react';
import { episodePath, KIND_LABELS } from './podcast.js';
import './founding.css';

const stamp = value => value ? new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—';

// Staff-only view of the podcast episode pages. The hourly sync adds every new episode by itself, so there is nothing to approve. This is only for the two choices that stay
// human: opening an AI-hosted (or source-less) episode to Google, or closing one again, and hiding an episode from the site completely.
export function AdminPodcast({ service }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load() { setError(''); try { setData(await service.adminPodcastOverview()); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!data) return <p role="status">{error || 'Loading…'}</p>;
  const sync = data.last_sync, open = data.episodes.filter(e => e.effective_index && !e.hidden).length;
  return <div className="admin-founding">
    <h2>Podcast pages</h2>
    {error && <p role="alert" className="error">{error}</p>}
    <p>{sync ? <><strong>{sync.ok ? 'Last check worked' : 'Last check failed'}</strong> ({stamp(sync.ran_at)}).{' '}
      {sync.ok ? `Found ${sync.found} episodes, ${sync.inserted} new, ${sync.changed} changed.` : sync.note}</> : 'The feed has not been read yet. It is checked every hour.'}
      {sync && !sync.ok && data.last_ok_sync && <> The last good check was {stamp(data.last_ok_sync)}. Nothing is removed when a check fails.</>}</p>
    <div className="stat-row">
      <div className="stat"><strong>{data.episodes.length}</strong><span>Episode pages</span></div>
      <div className="stat"><strong>{open}</strong><span>Open to Google</span></div>
      <div className="stat"><strong>{data.episodes.filter(e => !e.effective_index && !e.hidden).length}</strong><span>Not for Google</span></div>
      <div className="stat"><strong>{data.episodes.filter(e => e.hidden).length}</strong><span>Hidden</span></div>
    </div>
    <p className="field-note">Only a David's Take episode with a real source link and enough text is opened to Google automatically. AI-hosted episodes keep working for listeners and shared links, but ask Google not to list them until you open them here. Opening and closing takes effect within a minute.</p>
    {data.episodes.length === 0 ? <p className="field-note">No episodes have been saved yet.</p>
      : <div className="table-scroll"><table><thead><tr><th>Episode</th><th>Show</th><th>Published</th><th>Source</th><th>Google</th><th></th></tr></thead><tbody>
        {data.episodes.map(e => <tr key={e.guid}>
          <td>{e.hidden ? <s>{e.title}</s> : <a href={episodePath(e.slug)} target="_blank" rel="noopener noreferrer">{e.title}</a>}</td>
          <td>{KIND_LABELS[e.kind]}</td><td>{stamp(e.published_at)}</td><td>{e.sources.length ? e.sources.length + ' link' + (e.sources.length === 1 ? '' : 's') : 'none'}</td>
          <td>{e.hidden ? 'Hidden' : e.effective_index ? 'Open' : 'Closed'}{e.index_override ? ' (your choice)' : e.effective_index ? '' : e.noindex_reason ? ': ' + e.noindex_reason : ''}</td>
          <td><div className="founding-actions">
            {!e.hidden && (e.effective_index
              ? <button type="button" className="text-button" disabled={busy} onClick={() => run(() => service.adminPodcastSetIndex(e.guid, 'noindex'))}>Close to Google</button>
              : <button type="button" className="primary compact" disabled={busy} onClick={() => { if (window.confirm('Open this episode to Google? AI-hosted pages are not reviewed by a person before they go out.')) run(() => service.adminPodcastSetIndex(e.guid, 'index')); }}>Open to Google</button>)}
            {e.index_override && <button type="button" className="text-button" disabled={busy} onClick={() => run(() => service.adminPodcastSetIndex(e.guid, null))}>Use automatic rule</button>}
            <button type="button" className="text-button" disabled={busy} onClick={() => { if (e.hidden || window.confirm('Hide this episode from the site and the sitemap?')) run(() => service.adminPodcastSetHidden(e.guid, !e.hidden)); }}>{e.hidden ? 'Show again' : 'Hide'}</button>
          </div></td></tr>)}
      </tbody></table></div>}
  </div>;
}
