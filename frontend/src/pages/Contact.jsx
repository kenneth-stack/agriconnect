import { useState } from 'react';
import { api, when } from '../api.js';

export const CONTACT_EMAIL = 'contact@agriconnect.com';

export default function Contact({ user }) {
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', subject: '', message: '', website: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setMsg(null); setBusy(true);
    try { await api('/contact', { method: 'POST', body: f }); setMsg({ ok: 'Thank you. Your message has been sent, and we will reply to your email address.' }); setF({ ...f, subject: '', message: '' }); }
    catch (er) { setMsg({ err: er.message }); }
    setBusy(false);
  }

  return (
    <>
      <h2>Contact us</h2>
      <div className="dash">
        <form className="card" onSubmit={submit}>
          <div className="row">
            <label className="grow">Your name<input value={f.name} onChange={set('name')} required /></label>
            <label className="grow">Your email<input type="email" value={f.email} onChange={set('email')} required /></label>
          </div>
          <label>Subject<input value={f.subject} onChange={set('subject')} placeholder="e.g. A question about investment plans" /></label>
          <label>Message<textarea rows="6" value={f.message} onChange={set('message')} required minLength={10} /></label>
          <input name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
          {msg?.err && <p className="error" role="alert">{msg.err}</p>}{msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
        </form>
        <aside className="card">
          <h3>Other ways to reach us</h3>
          <p>Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          <p className="muted">Please never send your password, BVN or card details by email or through this form. We will never ask for them.</p>
        </aside>
      </div>
    </>
  );
}
