import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Gift } from 'lucide-react';
import { ItemArt, money } from './ItemArt.jsx';
import { GIVEAWAY_REQUIREMENT, MAILIN_EMAIL, eligibleStates, elapsedPercent, minAgeFor, oddsLine, referralLink, statesNote, ticketLine, timeLeft } from './giveaway.js';
import './giveaway.css';

// Gold flakes drifting up behind the giveaway card: the same effect as the sign-in box (.login-sparks in styles.css), fewer of them since it sits on a page full of cards.
const SPARKS = Array.from({ length: 12 }, (_, i) => ({ x: (i * 41 + 9) % 90 + 5, size: 3 + (i * 5) % 4, duration: 6 + (i % 5) * 1.4, delay: -(i * 0.9), drift: (i % 2 ? 1 : -1) * (5 + (i * 7) % 16) }));
function Sparks() {
  return <div className="login-sparks" aria-hidden="true">{SPARKS.map((spark, index) => <i key={index} style={{ '--x': spark.x + '%', '--s': spark.size + 'px', '--d': spark.duration + 's', '--delay': spark.delay + 's', '--drift': spark.drift + 'px' }}/>)}</div>;
}
export function GiveawayRibbon() { return <img className="giveaway-ribbon" src="/brand/sweepstakes-win-this-badge-v1.webp" width="900" height="265" alt="Win this"/>; }
const certificateText = item => {
  const issuer = item?.certificate_issuer || item?.certificate_company;
  return item?.certificate_number ? `${issuer ? issuer + ' ' : ''}certificate ${item.certificate_number}` : '';
};

// Bar = how far through the period we are (an honest bar even when the ticket count is small); the totals sit beside it.
export function GiveawayProgress({ giveaway, large = false }) {
  const percent = elapsedPercent(giveaway);
  return <div className={`giveaway-progress${large ? ' large' : ''}`}>
    <div className="giveaway-bar" role="progressbar" aria-label="Time through the giveaway" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><span style={{ width: Math.max(percent, 3) + '%' }}/></div>
    <p><strong>{giveaway.tickets.toLocaleString('en-US')}</strong> {giveaway.tickets === 1 ? 'ticket' : 'tickets'} · {giveaway.entrants.toLocaleString('en-US')} {giveaway.entrants === 1 ? 'entrant' : 'entrants'} · {timeLeft(giveaway.ends_at)}</p>
    {giveaway.tickets === 0 && <p className="giveaway-nudge">Be one of the first to enter.</p>}
  </div>;
}

function EnterButton({ giveaway, onEnter, busy }) {
  const me = giveaway.me;
  if (me?.entered) return <p className="giveaway-entered" role="status"><Check size={16}/> {me.ready ? "You're in" : 'Entry saved'}{me.ready ? ` · ${me.tickets} ${me.tickets === 1 ? 'ticket' : 'tickets'}` : ''}</p>;
  return <button type="button" className="giveaway-enter" disabled={busy} onClick={onEnter}>Enter the giveaway <ArrowRight size={16}/></button>;
}

// The pinned card at the top of Discover.
export function GiveawayCard({ giveaway, item, onOpen, onEnter, busy }) {
  return <article className="giveaway-card" aria-label="Current giveaway">
    <Sparks/>
    <GiveawayRibbon/>
    <button type="button" className="giveaway-photo" onClick={onOpen} aria-label={`View the giveaway prize: ${giveaway.title}`}>
      <ItemArt kind={item?.artwork} category={item?.category} photo={item?.media?.[0]?.url} thumbId={item?.id}/>
    </button>
    <div className="giveaway-body">
      <h3>{giveaway.title}</h3>
      {certificateText(item) && <p className="giveaway-cert">{certificateText(item)}</p>}
      <p className="giveaway-notfor">Not for sale · prize giveaway{item?.price_cents ? ` · prize value ${money(item.price_cents)}` : ''}</p>
      <GiveawayProgress giveaway={giveaway}/>
      <EnterButton giveaway={giveaway} onEnter={onEnter} busy={busy}/>
      <p className="giveaway-requirement">{GIVEAWAY_REQUIREMENT}</p>
      <p className="giveaway-fine">{oddsLine(giveaway)} No account? Enter free by email: {MAILIN_EMAIL}. {statesNote(giveaway.excluded_states)}</p>
      <button type="button" className="text-button giveaway-details" onClick={onOpen}>Details and rules</button>
    </div>
  </article>;
}

// Replaces the buy buttons on the prize's own item page.
export function GiveawayPanel({ giveaway, item, referral, onEnter, busy }) {
  const [copied, setCopied] = useState(false);
  const link = referralLink(referral);
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is also shown to copy by hand */ } }
  return <section className="giveaway-panel" aria-label="Giveaway">
    <Sparks/>
    <GiveawayRibbon/>
    <h3>Win this {item?.title || giveaway.title}</h3>
    {item && <p className="giveaway-notfor">Not for sale · a giveaway prize{item.price_cents ? ` · valued at ${money(item.price_cents)}` : ''}</p>}
    <GiveawayProgress giveaway={giveaway} large/>
    <p className="giveaway-fine giveaway-odds">{oddsLine(giveaway)}</p>
    <EnterButton giveaway={giveaway} onEnter={onEnter} busy={busy}/>
    {ticketLine(giveaway.me) && <p className="field-note giveaway-ticketline">{ticketLine(giveaway.me)}</p>}
    <p className="giveaway-requirement">{GIVEAWAY_REQUIREMENT}</p>
    <div className="giveaway-earn"><h4>Earn more tickets</h4><ul>
      <li><strong>1 ticket</strong> for entering</li>
      <li><strong>+1 ticket</strong> for every item you list (once it has been live for 7 days)</li>
      <li><strong>+1 ticket</strong> for every member who joins through your link and finishes Stripe setup</li>
    </ul>
    {link && <div className="giveaway-link"><code>{link}</code><button type="button" className="text-button" onClick={copy}><Copy size={14}/> {copied ? 'Copied' : 'Copy my link'}</button></div>}
    </div>
    <p className="giveaway-fine">One winner is picked at random on {new Date(giveaway.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. More tickets, better odds. {statesNote(giveaway.excluded_states)} No account? Enter free by email: {MAILIN_EMAIL}. <a href={giveaway.rules_url}>Official rules</a></p>
  </section>;
}

// The step after "Enter": agree to the rules, then (if needed) finish Stripe setup. The caller wraps it in the app's Modal.
export function GiveawayEnterForm({ giveaway, onEnter, onConnectStripe, onDone }) {
  const [agreed, setAgreed] = useState(false), [stateCode, setStateCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(giveaway?.me?.entered ? giveaway : null);
  const states = eligibleStates(giveaway.excluded_states);
  async function confirm() { setBusy(true); setError(''); try { setResult(await onEnter(stateCode)); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  if (result?.me?.entered) return <div className="form-stack giveaway-form">
    {result.me.ready
      ? <><h3><Check size={18}/> You're in!</h3><p>{ticketLine(result.me)}</p><p className="field-note">List an item, or share your link, to earn more tickets.</p><button type="button" className="primary" onClick={onDone}>Done</button></>
      : <><h3>One more step</h3><p>Your entry is saved. To confirm it, finish payout setup with Stripe. It is free, and Stripe collects the ID and bank details, so Credabilia never sees them. Your tickets start counting as soon as Stripe verifies your account.</p>
        <button type="button" className="primary" onClick={onConnectStripe}>Finish payout setup <ArrowRight size={16}/></button><button type="button" className="text-button" onClick={onDone}>Later</button></>}
  </div>;
  return <div className="form-stack giveaway-form">
    <h3><Gift size={18}/> {giveaway.title}</h3>
    <p className="giveaway-requirement">To keep this giveaway fair and free of fake accounts, every entrant must complete payout setup with Stripe, our payment partner. It's free. Stripe collects the ID and bank details, and Credabilia never sees them. Your entry is confirmed once Stripe verifies your account.</p>
    <p className="field-note">{statesNote(giveaway.excluded_states)} No account? You can enter free by email instead: write to {MAILIN_EMAIL}.</p>
    <label>State where you live<select required value={stateCode} onChange={event => setStateCode(event.target.value)}><option value="">Choose your state</option>{states.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
    <label className="check-row"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)}/> <span>I am {minAgeFor(stateCode)} or older, live in the state I chose, and agree to the <a href={giveaway.rules_url} target="_blank" rel="noreferrer">official rules</a>.</span></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary" disabled={!agreed || !stateCode || busy} onClick={confirm}>{busy ? 'Entering…' : 'Confirm my entry'}</button>
  </div>;
}

// Banner for a winner: claim the prize by entering a delivery address.
export function GiveawayWinBanner({ win, onClaim }) {
  if (!win) return null;
  if (win.status === 'claimed') return <div className="evidence-box giveaway-win" role="status"><h3>You won the {win.title}!</h3><p className="field-note">Your delivery address is in. We'll ship it to you at no cost and email you the tracking.</p></div>;
  const by = new Date(win.claim_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return <div className="evidence-box giveaway-win" role="status"><h3>You won the {win.title}!</h3><p className="field-note">Claim your prize by {by}. We cover the shipping.</p><button type="button" className="primary compact" onClick={onClaim}>Claim my prize</button></div>;
}
export function GiveawayClaimForm({ onSubmit, onDone }) {
  const [address, setAddress] = useState({ name: '', street1: '', street2: '', city: '', state: '', zip: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = key => event => setAddress(value => ({ ...value, [key]: event.target.value }));
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { await onSubmit(address); onDone(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <form className="form-stack" onSubmit={submit}>
    <p className="field-note">Where should we send your prize? Shipping is on us.</p>
    <label>Full name<input required value={address.name} onChange={set('name')} autoComplete="name"/></label>
    <label>Street address<input required value={address.street1} onChange={set('street1')} autoComplete="address-line1"/></label>
    <label>Apartment, suite (optional)<input value={address.street2} onChange={set('street2')} autoComplete="address-line2"/></label>
    <label>City<input required value={address.city} onChange={set('city')} autoComplete="address-level2"/></label>
    <div className="two-col"><label>State<input required maxLength="2" value={address.state} onChange={event => setAddress(value => ({ ...value, state: event.target.value.toUpperCase() }))} autoComplete="address-level1"/></label><label>ZIP<input required value={address.zip} onChange={set('zip')} autoComplete="postal-code"/></label></div>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send my address'}</button>
  </form>;
}

// A member's own link and counts (shown in the giveaway panel and the profile area).
export function ReferralCard({ service }) {
  const [info, setInfo] = useState(null), [copied, setCopied] = useState(false);
  useEffect(() => { let alive = true; service.myReferralInfo().then(value => { if (alive) setInfo(value); }).catch(() => {}); return () => { alive = false; }; }, []);
  if (!info) return null;
  const link = referralLink(info);
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* shown below to copy by hand */ } }
  return <div className="evidence-box referral-card"><h3>Your invite link</h3>
    <p className="field-note">Share it. Everyone who joins through it and finishes Stripe setup earns you a giveaway ticket.</p>
    <div className="giveaway-link"><code>{link}</code><button type="button" className="text-button" onClick={copy}><Copy size={14}/> {copied ? 'Copied' : 'Copy'}</button></div>
    <p className="field-note">{info.signed_up} joined · {info.verified} verified</p></div>;
}

// A store with nothing listed yet: instead of a dead end, show what else is in the kingdom (and the Join button stays in the header).
export function EmptyStoreCarousel({ service, ownerName }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    // The giveaway prize is never shown as an ordinary item with a price, so it is left out here.
    Promise.all([service.listings(), Promise.resolve().then(() => service.currentGiveaway?.()).catch(() => null)])
      .then(([list, giveaway]) => { if (alive) setItems((list || []).filter(item => item.status === 'active' && item.id !== giveaway?.listing_id).slice(0, 10)); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);
  return <div className="empty-store-carousel">
    <div className="empty-state"><Gift size={34}/><h3>{ownerName ? `${ownerName} hasn't listed anything yet.` : 'Nothing listed right now.'}</h3><p>Take a look at what else is in the kingdom, or join and list your own.</p></div>
    {items?.length > 0 && <div className="store-carousel" role="list" aria-label="Items in the kingdom">{items.map(item => <a role="listitem" className="item-card" key={item.id} href={`/item/${item.id}`} aria-label={`View ${item.title}`}>
      <ItemArt category={item.category} photo={item.media?.[0]?.url} thumbId={item.id}/><div className="item-card-content"><div className="card-meta"><span>{item.category}</span></div><h3>{item.title}</h3><strong>{money(item.price_cents)}</strong></div></a>)}</div>}
  </div>;
}

// Admin: switch an item from the King's Collection into the giveaway (and back off), add free email entries, and see how it is going.
function MailinForm({ service, onAdded }) {
  const [form, setForm] = useState({ name: '', email: '', state: '' }), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const set = key => event => setForm(value => ({ ...value, [key]: event.target.value }));
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); setDone(''); try { await service.adminAddMailinEntry(form.name, form.email, form.state); setDone(`Added ${form.name}.`); setForm({ name: '', email: '', state: '' }); onAdded(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <form className="form-stack" onSubmit={submit}>
    <h3>Add a free email entry</h3>
    <p className="field-note">When someone writes to {MAILIN_EMAIL} to enter, add them here. One ticket each, no account needed.</p>
    <label>Name<input required value={form.name} onChange={set('name')}/></label>
    <label>Email<input required type="email" value={form.email} onChange={set('email')}/></label>
    <label>State where they live<select required value={form.state} onChange={set('state')}><option value="">Choose a state</option>{eligibleStates().map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
    {error && <p role="alert" className="error">{error}</p>}{done && <p role="status" className="field-note">{done}</p>}
    <button className="primary compact" disabled={busy}>{busy ? 'Adding…' : 'Add entry'}</button>
  </form>;
}
function MailinClaim({ winner, service, onDone }) {
  const [address, setAddress] = useState({ name: winner.name || '', street1: '', street2: '', city: '', state: '', zip: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = key => event => setAddress(value => ({ ...value, [key]: event.target.value }));
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { await service.adminRecordMailinClaim(winner.id, address); onDone(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <form className="form-stack" onSubmit={submit}>
    <p className="field-note">Write to {winner.email}, then record the delivery address they send you.</p>
    <label>Name<input required value={address.name} onChange={set('name')}/></label>
    <label>Street<input required value={address.street1} onChange={set('street1')}/></label>
    <label>Apt (optional)<input value={address.street2} onChange={set('street2')}/></label>
    <label>City<input required value={address.city} onChange={set('city')}/></label>
    <div className="two-col"><label>State<input required maxLength="2" value={address.state} onChange={event => setAddress(value => ({ ...value, state: event.target.value.toUpperCase() }))}/></label><label>ZIP<input required value={address.zip} onChange={set('zip')}/></label></div>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary compact" disabled={busy}>{busy ? 'Saving…' : 'Record address'}</button>
  </form>;
}
export function GiveawayAdmin({ service }) {
  const [data, setData] = useState(undefined), [error, setError] = useState(''), [busy, setBusy] = useState(false), [picked, setPicked] = useState(''), [endsAt, setEndsAt] = useState('');
  async function load() { try { setData(await service.adminGiveawayOverview()); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  async function run(action) { setBusy(true); setError(''); try { await action(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  if (error && data === undefined) return <p role="alert" className="error">{error}</p>;
  if (data === undefined) return <p role="status">Loading the giveaway…</p>;
  const current = data.current;
  const sixMonths = new Date(Date.now() + 182 * 86400000).toISOString().slice(0, 10);
  return <div className="admin-list">
    {error && <p role="alert" className="error">{error}</p>}
    {current ? <><div className="evidence-box"><div className="admin-row-head"><span><strong>Running:</strong> {current.title}</span><span>{timeLeft(current.ends_at)}</span></div>
      <p className="field-note">{current.entrants} {current.entrants === 1 ? 'entrant' : 'entrants'} ({current.mailin_entrants} by email) · {current.pending_entrants} members waiting on Stripe · {current.tickets} tickets. The draw runs by itself on {new Date(current.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. It cannot end early. {statesNote(current.excluded_states)}</p>
      <div className="submit-row"><button type="button" className="text-button" disabled={busy} onClick={() => window.confirm('Switch the giveaway off? The item goes back to normal.') && run(() => service.adminCancelGiveaway(current.id))}>Switch off</button></div></div>
      <div className="evidence-box"><MailinForm service={service} onAdded={load}/></div></>
      : <div className="evidence-box"><h3>Start a giveaway</h3>
        {data.candidates.length === 0 ? <p className="field-note">No King's Collection items are available. Only an active fixed-price item worth under $5,000, with no purchase in progress, can become a giveaway.</p>
          : <form className="form-stack" onSubmit={event => { event.preventDefault(); run(() => service.adminStartGiveaway(picked, endsAt ? new Date(endsAt + 'T23:59:00').toISOString() : null)); }}>
            <label>Prize (from the King's Collection, under $5,000)<select required value={picked} onChange={event => setPicked(event.target.value)}><option value="">Choose an item</option>{data.candidates.map(item => <option key={item.id} value={item.id}>{item.title} · {money(item.price_cents)}</option>)}</select></label>
            <label>Last day (the automatic draw)<input type="date" value={endsAt} min={new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)} onChange={event => setEndsAt(event.target.value)}/></label>
            <p className="field-note">Leave the date empty for six months from now ({sixMonths}). It is fixed once you start. Do not change the official rules after starting.</p>
            <p className="field-note">While it runs, the item cannot be bought, bid on, or requested. Members enter in the app (Stripe setup required); anyone else can enter free by email.</p>
            <button className="primary compact" disabled={busy || !picked}>{busy ? 'Starting…' : 'Switch the giveaway on'}</button></form>}
      </div>}
    <h3>Past giveaways</h3>
    {data.history.length === 0 ? <p className="field-note">None yet.</p> : data.history.map(g => <div key={g.id} className="evidence-box"><div className="admin-row-head"><span>{g.title}</span><span>{g.status}</span></div>
      {g.winners.map(w => <div key={w.place}><p className="field-note">{w.place === 1 ? 'Winner' : 'Alternate'}: {w.name}{w.kind === 'mail-in' ? ` (email entry, ${w.email})` : ''} · {w.status}{w.shipping_address ? ` · ship to ${w.shipping_address.name}, ${w.shipping_address.street1}${w.shipping_address.street2 ? ' ' + w.shipping_address.street2 : ''}, ${w.shipping_address.city} ${w.shipping_address.state} ${w.shipping_address.zip}` : w.claim_deadline && w.status === 'notified' ? ` · claim by ${new Date(w.claim_deadline).toLocaleDateString('en-US')}` : ''}</p>
        {w.kind === 'mail-in' && w.status === 'notified' && <MailinClaim winner={w} service={service} onDone={load}/>}</div>)}</div>)}
  </div>;
}

// Admin only (the caller shows it only to the operator, and only on a King's Collection item; the database still checks): switch THIS item on or off as the giveaway
// right from its page. Starting needs an active, fixed-price item worth under $5,000 and no other giveaway running.
export function GiveawayItemControl({ item, giveaway, service, onChanged }) {
  const [endsAt, setEndsAt] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sixMonths = new Date(Date.now() + 182 * 86400000).toISOString().slice(0, 10);
  async function run(action) { setBusy(true); setError(''); try { await action(); onChanged?.(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  const running = giveaway && giveaway.listing_id === item.id;
  let body;
  if (running) {
    body = <><p className="field-note"><strong>This item is the giveaway.</strong> {timeLeft(giveaway.ends_at)} · {giveaway.entrants} {giveaway.entrants === 1 ? 'entrant' : 'entrants'} · {giveaway.tickets} tickets. It cannot be bought while it runs.</p>
      <button type="button" className="text-button" disabled={busy} onClick={() => window.confirm('Switch the giveaway off? This item goes back to normal and can be bought again.') && run(() => service.adminCancelGiveaway(giveaway.id))}>Switch the giveaway off</button></>;
  } else if (giveaway) {
    body = <p className="field-note">A giveaway is already running ({giveaway.title}). Switch that one off first.</p>;
  } else if (item.listing_type !== 'fixed' || item.status !== 'active') {
    body = <p className="field-note">Only an active fixed-price item can be the giveaway.</p>;
  } else if (item.price_cents >= 500000) {
    body = <p className="field-note">A prize worth $5,000 or more needs state registration, so it cannot be the giveaway. Choose one under $5,000.</p>;
  } else {
    body = <><p className="field-note">Make this the pinned giveaway. While it runs nobody can buy it, bid on it or request it. The automatic draw is on the last day below, or six months from now if you leave it empty.</p>
      <label>Last day (optional)<input type="date" value={endsAt} min={new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)} placeholder={sixMonths} onChange={event => setEndsAt(event.target.value)}/></label>
      <button type="button" className="primary compact" disabled={busy} onClick={() => window.confirm(`Make "${item.title}" the giveaway? It can no longer be bought while it runs.`) && run(() => service.adminStartGiveaway(item.id, endsAt ? new Date(endsAt + 'T23:59:00').toISOString() : null))}>{busy ? 'Starting…' : 'Make this the giveaway'}</button></>;
  }
  return <section className="evidence-box giveaway-item-control" aria-label="Giveaway (admin only)"><p className="eyebrow">ADMIN ONLY · GIVEAWAY</p>{body}{error && <p role="alert" className="error">{error}</p>}</section>;
}
