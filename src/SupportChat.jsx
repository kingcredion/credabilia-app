import React, { useEffect, useState } from 'react';

export function SupportChat({ service }) {
  const [messages, setMessages] = useState(undefined);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try { setMessages(await service.getSupportMessages()); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);

  async function submit(event) {
    event.preventDefault(); if (busy || !body.trim()) return;
    setBusy(true); setError('');
    try {
      const { user_message, assistant_message } = await service.sendSupportMessage(body);
      setMessages(list => [...(list || []), user_message, assistant_message].filter(Boolean));
      setBody('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="form-stack">
    {!messages?.length && <div className="support-welcome">
      <img src="/brand/king-credion-support.png" alt="King Credion, wearing his crown and a headset, seated at a laptop"/>
      <h3>Hi, I'm King Credion. How can I help?</h3>
      <p className="field-note">I'm an AI support assistant. Ask about fees, escrow, shipping insurance, audits, or your own orders.</p>
    </div>}
    {messages === undefined ? <p role="status" className="field-note">Loading…</p>
      : messages.map(message => <div key={message.id} className="support-message">
          {message.role === 'assistant' && <img className="support-avatar" src="/brand/king-credion-chat-icon-ai.png" alt=""/>}
          <div className="recorded"><div><strong>{message.role === 'assistant' ? 'King Credion' : message.role === 'operator' ? 'Credabilia Team' : 'You'}</strong><p>{message.body}</p></div></div>
        </div>)}
    {error && <p role="alert" className="error">{error}</p>}
    <form className="form-row" onSubmit={submit}>
      <label>Your message<textarea value={body} onChange={event => setBody(event.target.value)} rows={2} maxLength={2000} placeholder="Ask King Credion a question…" disabled={busy}/></label>
      <button className="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
  </div>;
}
