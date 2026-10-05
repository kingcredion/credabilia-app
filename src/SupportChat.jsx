import React, { useEffect, useRef, useState } from 'react';

export function SupportChat({ service }) {
  const [messages, setMessages] = useState(undefined);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackPhone, setCallbackPhone] = useState('');
  const [callbackReason, setCallbackReason] = useState('');
  const [callbackBusy, setCallbackBusy] = useState(false);
  const [callbackError, setCallbackError] = useState('');
  const [callbackSent, setCallbackSent] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [bugWhat, setBugWhat] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugBusy, setBugBusy] = useState(false);
  const [bugError, setBugError] = useState('');
  const logRef = useRef(null);

  async function load() {
    setError('');
    try { setMessages(await service.getSupportMessages()); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

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

  async function submitCallback(event) {
    event.preventDefault(); if (callbackBusy || !callbackPhone.trim()) return;
    setCallbackBusy(true); setCallbackError('');
    try {
      await service.requestHumanCallback(callbackPhone, callbackReason);
      setCallbackSent(true);
    } catch (err) { setCallbackError(err.message); }
    finally { setCallbackBusy(false); }
  }

  async function submitBug(event) {
    event.preventDefault(); if (bugBusy || !bugWhat.trim()) return;
    setBugBusy(true); setBugError('');
    try {
      const { user_message, assistant_message } = await service.reportBug(bugWhat, bugSteps);
      setMessages(list => [...(list || []), user_message, assistant_message].filter(Boolean));
      setBugWhat(''); setBugSteps(''); setBugOpen(false);
    } catch (err) { setBugError(err.message); }
    finally { setBugBusy(false); }
  }

  return <div className="form-stack" data-clarity-mask="True">
    {!messages?.length && <div className="support-welcome">
      <img src="/brand/screen-face-v1/support.webp" alt="King Credion, wearing his crown and a headset, seated at a laptop"/>
      <h3>Hi, I'm King Credion. How can I help?</h3>
      <p className="field-note">I'm an AI support assistant. Ask about fees, escrow, shipping insurance, audits, or your own orders.</p>
    </div>}
    {messages === undefined ? <p role="status" className="field-note">Loading…</p>
      : <div className="chat-log" ref={logRef}>
          {messages.map(message => <div key={message.id} className={`support-message ${message.role === 'user' ? 'mine' : 'theirs'}`}>
              {message.role === 'assistant' && <img className="support-avatar" src="/brand/screen-face-v1/chat.webp" alt=""/>}
              <div className="recorded"><div><strong>{message.role === 'assistant' ? 'King Credion' : message.role === 'operator' ? 'Credabilia Team' : 'You'}{message.kind === 'bug' && message.role === 'user' ? ' · Problem report' : ''}</strong><p>{message.body}</p></div></div>
            </div>)}
          {busy && <div className="support-message theirs"><img className="support-avatar" src="/brand/screen-face-v1/chat.webp" alt=""/><div className="recorded typing-dots"><span/><span/><span/></div></div>}
        </div>}
    {error && <p role="alert" className="error">{error}</p>}
    <form className="form-row" onSubmit={submit}>
      <label>Your message<textarea value={body} onChange={event => setBody(event.target.value)} rows={2} maxLength={2000} placeholder="Ask King Credion a question…" disabled={busy}/></label>
      <button className="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
    {bugOpen ? <form className="form-stack" onSubmit={submitBug}>
        <p className="field-note">Found something broken, confusing, or wrong? Tell us. This goes to the Credabilia team, not to the AI. We also record the page you are on and your browser to help us find it.</p>
        <label>What went wrong?<textarea value={bugWhat} onChange={event => setBugWhat(event.target.value)} rows={3} maxLength={2000} disabled={bugBusy} required/></label>
        <label>What were you doing? <span className="optional">optional</span><textarea value={bugSteps} onChange={event => setBugSteps(event.target.value)} rows={2} maxLength={1000} disabled={bugBusy}/></label>
        {bugError && <p role="alert" className="error">{bugError}</p>}
        <div className="submit-row">
          <button className="primary" disabled={bugBusy || !bugWhat.trim()}>{bugBusy ? 'Sending…' : 'Send report'}</button>
          <button type="button" className="text-button" onClick={() => setBugOpen(false)} disabled={bugBusy}>Cancel</button>
        </div>
      </form>
      : <button type="button" className="text-button" onClick={() => setBugOpen(true)}>Report a problem</button>}
    {callbackSent ? <p className="field-note">Got it — someone from Credabilia will call you back shortly.</p>
      : callbackOpen ? <form className="form-stack" onSubmit={submitCallback}>
          <label>Your phone number<input type="tel" value={callbackPhone} onChange={event => setCallbackPhone(event.target.value)} placeholder="+1 555 555 5555" disabled={callbackBusy} required/></label>
          <label>What's this about? <span className="optional">optional</span><input value={callbackReason} onChange={event => setCallbackReason(event.target.value)} maxLength={300} disabled={callbackBusy}/></label>
          {callbackError && <p role="alert" className="error">{callbackError}</p>}
          <div className="submit-row">
            <button className="primary" disabled={callbackBusy || !callbackPhone.trim()}>{callbackBusy ? 'Sending…' : 'Request a callback'}</button>
            <button type="button" className="text-button" onClick={() => setCallbackOpen(false)} disabled={callbackBusy}>Cancel</button>
          </div>
        </form>
      : <button type="button" className="text-button" onClick={() => setCallbackOpen(true)}>Talk to a human instead</button>}
  </div>;
}
