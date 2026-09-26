import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, ArrowRight } from 'lucide-react';

function money(cents) { return typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : ''; }

export function MessageThread({ conversationId, service, session, counterpartyLabel, messageCount, autoOpen, onFocused, onRead, pinnedListing, onOpenListing, forceOpen }) {
  const [open, setOpen] = useState(!!forceOpen);
  const [messages, setMessages] = useState(undefined);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  async function load() {
    setError('');
    try { setMessages(await service.getMessages(conversationId)); }
    catch (err) { setError(err.message); }
    service.markMessagesRead(conversationId).then(() => onRead?.()).catch(() => {});
  }
  useEffect(() => { if (open) load(); }, [open, conversationId]);
  useEffect(() => { if (autoOpen) { setOpen(true); onFocused?.(); } }, [autoOpen]);

  async function submit(event) {
    event.preventDefault(); if (busy || !body.trim()) return;
    setBusy(true); setError('');
    try {
      const sent = await service.sendMessage(conversationId, body);
      setMessages(list => [...(list || []), sent]);
      setBody('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="text-button" onClick={() => setOpen(true)}><MessageCircle size={16}/>Message {counterpartyLabel}{messageCount ? ` (${messageCount})` : ''}</button>;

  return <div className={forceOpen ? '' : 'evidence-box'}>
    {!forceOpen && <h3><MessageCircle size={18}/>Message {counterpartyLabel}</h3>}
    {pinnedListing && <button type="button" className="pinned-listing" onClick={() => onOpenListing?.(pinnedListing.listing_id)}>
      {pinnedListing.media?.[0]?.url && <img src={pinnedListing.media[0].url} alt=""/>}
      <span><strong>{pinnedListing.listing_status && pinnedListing.listing_status !== 'active' ? 'No longer available' : pinnedListing.listing_title}</strong>{pinnedListing.listing_status === 'active' && <em>{money(pinnedListing.listing_price_cents)}</em>}</span>
      <ArrowRight size={15}/>
    </button>}
    {messages === undefined ? <p role="status" className="field-note">Loading messages…</p>
      : !messages.length ? <p className="field-note">No messages yet. Say hello.</p>
      : <div className="chat-log" ref={logRef}>{messages.map(message => <div key={message.id} className={`recorded chat-bubble ${message.sender_id === session?.user.id ? 'mine' : 'theirs'}`}><div><strong>{message.sender_id === session?.user.id ? 'You' : message.sender_name}</strong><p>{message.body}</p></div></div>)}</div>}
    {error && <p role="alert" className="error">{error}</p>}
    <form className="form-row" onSubmit={submit}>
      <label>Your message<textarea value={body} onChange={event => setBody(event.target.value)} rows={2} maxLength={2000} placeholder="Ask a question…" disabled={busy}/></label>
      <button className="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
    {!forceOpen && <><button type="button" className="text-button" onClick={load} disabled={busy}>Refresh</button>
    <button type="button" className="text-button" onClick={() => setOpen(false)}>Hide</button></>}
  </div>;
}
