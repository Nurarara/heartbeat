"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Brand, productAPI } from './product-shell';

/** Private beta sign-in: email address, then the six-digit code we email. One page for new and returning testers. */
export function CodeSignIn({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [step, setStep] = useState<'email' | 'code'>('email'), [address, setAddress] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [wait, setWait] = useState(0), [devCode, setDevCode] = useState('');
  const codeInput = useRef<HTMLInputElement>(null), submitted = useRef('');

  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(value => value - 1), 1000); return () => clearTimeout(timer); }, [wait]);
  useEffect(() => { if (step === 'code') codeInput.current?.focus(); }, [step]);

  async function send(event?: React.FormEvent) {
    event?.preventDefault(); setBusy(true); setMessage('');
    try {
      const value = await productAPI<{ sent: boolean; devCode?: string }>('auth/code/send', { email: address });
      setDevCode(value.devCode || ''); setStep('code'); setCode(''); submitted.current = ''; setWait(30);
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function verify(value = code) {
    if (!/^\d{6}$/.test(value) || submitted.current === value) return;
    submitted.current = value; setBusy(true); setMessage('');
    try { await productAPI('auth/code/verify', { email: address, code: value }); await onSignedIn(); }
    catch (reason) { setMessage((reason as Error).message); setBusy(false); }
  }
  function typed(value: string) { const digits = value.replace(/\D/g, '').slice(0, 6); setCode(digits); if (digits.length === 6) void verify(digits); }

  return <div className="hp-site hp-auth"><div className="hp-auth-form"><Brand /><a href="/" className="hp-auth-back"><ArrowLeft size={14} /> Back to the world</a>
    <p className="hp-eyebrow">PRIVATE TEST</p>
    <h1>{step === 'email' ? <>Come<br /><em>on in.</em></> : <>Check your<br /><em>email.</em></>}</h1>
    <p>{step === 'email' ? 'Enter the email you were invited with. We’ll send you a six-digit code. No password needed.' : <>We sent a code to <strong>{address}</strong>. It works for 10 minutes.</>}</p>
    {message && <p className="hp-message hp-auth-feedback" role="status">{message}{/invite list/.test(message) && <> <a href="/#request">Request access</a></>}</p>}
    {step === 'email' ? <form onSubmit={send}>
      <label>Email address<input type="email" autoComplete="email" required autoFocus value={address} onChange={event => setAddress(event.target.value)} placeholder="you@example.com" /></label>
      <button className="hp-button" disabled={busy}>{busy ? 'Sending…' : 'Send my code'}<ArrowRight size={17} /></button>
    </form> : <form onSubmit={event => { event.preventDefault(); submitted.current = ''; void verify(); }}>
      <label>Six-digit code<input ref={codeInput} className="hp-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={event => typed(event.target.value)} placeholder="••••••" aria-describedby="code-help" /></label>
      {devCode && <p className="hp-local-note">Local test · email isn’t set up, so here is the code: <strong>{devCode}</strong></p>}
      <button className="hp-button" disabled={busy || code.length !== 6}>{busy ? 'One moment…' : 'Come on in'}<ArrowRight size={17} /></button>
      <p id="code-help" className="hp-auth-switch">No email? Check spam, or <button type="button" disabled={wait > 0 || busy} onClick={() => void send()}>{wait > 0 ? `send again in ${wait}s` : 'send a new code'}</button> · <button type="button" onClick={() => { setStep('email'); setMessage(''); }}>use another email</button></p>
    </form>}
    <p className="hp-fine">By continuing, you agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy information</a>. During the test, Heartbeat records when your screen is open and for how long, to improve it.</p>
  </div><aside className="hp-auth-art"><img src="/showcase/pulse-organism.png" alt="An illustrated glass form with a warm pulse" /><div><p className="hp-eyebrow">SOMEWHERE BETWEEN HERE AND NOW</p><h2>A screen<br /><em>with a pulse.</em></h2><p>Let the day in. Leave the noise outside.</p></div></aside></div>;
}
