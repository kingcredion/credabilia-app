import React, { useEffect, useRef, useState } from 'react';
import { Mic, PhoneOff } from 'lucide-react';

const PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY?.trim();
const ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID?.trim();

export const voiceAssistantAvailable = Boolean(PUBLIC_KEY && ASSISTANT_ID);

export function VoiceAssistant() {
  const [status, setStatus] = useState('idle'); // idle | connecting | active
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [error, setError] = useState('');
  const vapiRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    import('@vapi-ai/web').then(({ default: Vapi }) => {
      if (cancelled) return;
      const vapi = new Vapi(PUBLIC_KEY);
      vapi.on('call-start', () => setStatus('active'));
      vapi.on('call-end', () => { setStatus('idle'); setAssistantSpeaking(false); });
      vapi.on('speech-start', () => setAssistantSpeaking(true));
      vapi.on('speech-end', () => setAssistantSpeaking(false));
      vapi.on('error', err => { setError(err?.message || 'The call could not continue.'); setStatus('idle'); });
      vapiRef.current = vapi;
    });
    return () => { cancelled = true; vapiRef.current?.stop(); };
  }, []);

  function startCall() {
    setError(''); setStatus('connecting');
    vapiRef.current?.start(ASSISTANT_ID);
  }
  function endCall() { vapiRef.current?.stop(); }

  return <div className="form-stack">
    <div className="support-welcome">
      <img src="/brand/king-credion-support.png" alt="King Credion, wearing his crown and a headset, seated at a laptop"/>
      <h3>Talk to King Credion</h3>
      <p className="field-note">Speak with our AI voice assistant right in your browser — ask if an item is still available, its price, or general questions about Credabilia.</p>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    {status === 'idle' && <button className="primary full-width" onClick={startCall} disabled={!vapiRef.current}><Mic size={18}/>Start voice call</button>}
    {status === 'connecting' && <button className="primary full-width" disabled>Connecting…</button>}
    {status === 'active' && <>
      <p role="status" className="field-note">{assistantSpeaking ? 'King Credion is speaking…' : 'Listening…'}</p>
      <button className="text-button full-width" onClick={endCall}><PhoneOff size={18}/>End call</button>
    </>}
  </div>;
}
