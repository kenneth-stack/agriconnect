import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  return (
    <form className="card narrow" onSubmit={async (e) => {
      e.preventDefault();
      try { const r = await api('/auth/forgot', { method: 'POST', body: { email } }); setMsg({ ok: r.message }); }
      catch (er) { setMsg({ err: er.message }); }
    }}>
      <h2>Forgot your password?</h2>
      <p className="muted">Enter your email and we will send you a link to choose a new password.</p>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}{msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
      <button className="btn">Send reset link</button>
      <Link to="/login">Back to log in</Link>
    </form>
  );
}
