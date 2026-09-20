import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';

export function MessageThread({ purchaseId, service, session, counterpartyLabel, messageCount, autoOpen, onFocused, onRead }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(undefined);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try { setMessages(await service.getMessages(purchaseId)); }
    catch (err) { setError(err.message); }
    service.markMessagesRead(purchaseId).then(() => onRead?.()).catch(() => {});
  }
  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => { if (autoOpen) { setOpen(true); onFocused?.(); } }, [autoOpen]);

  async function submit(event) {
    event.preventDefault(); if (busy || !body.trim()) return;
    setBusy(true); setError('');
    try {
      const sent = await service.sendMessage(purchaseId, body);
      setMessages(list => [...(list || []), sent]);
      setBody('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="text-button" onClick={() => setOpen(true)}><MessageCircle size={16}/>Message {counterpartyLabel}{messageCount ? ` (${messageCount})` : ''}</button>;

  return <div className="evidence-box">
    <h3><MessageCircle size={18}/>Message {counterpartyLabel}</h3>
    {messages === undefined ? <p role="status" className="field-note">Loading messages…</p>
      : !messages.length ? <p className="field-note">No messages yet. Say hello.</p>
      : messages.map(message => <div key={message.id} className="recorded"><div><strong>{message.sender_id === session?.user.id ? 'You' : message.sender_name}</strong><p>{message.body}</p></div></div>)}
    {error && <p role="alert" className="error">{error}</p>}
    <form className="form-row" onSubmit={submit}>
      <label>Your message<textarea value={body} onChange={event => setBody(event.target.value)} rows={2} maxLength={2000} placeholder="Ask a question about this order…" disabled={busy}/></label>
      <button className="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
    <button type="button" className="text-button" onClick={load} disabled={busy}>Refresh</button>
    <button type="button" className="text-button" onClick={() => setOpen(false)}>Hide</button>
  </div>;
}
