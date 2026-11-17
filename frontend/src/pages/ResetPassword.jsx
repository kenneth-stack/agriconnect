import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  return (
    <form className="card narrow" onSubmit={async (e) => {
      e.preventDefault();
      try { await api('/auth/reset', { method: 'POST', body: { token: params.get('token'), password } }); setMsg({ ok: 'Password changed. You can now log in.' }); }
      catch (er) { setMsg({ err: er.message }); }
    }}>
      <h2>Choose a new password</h2>
      <PasswordInput label="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}{msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
      {msg?.ok ? <Link className="btn" to="/login">Log in</Link> : <button className="btn">Save new password</button>}
      {msg?.err && <Link to="/forgot-password">Request a new link</Link>}
    </form>
  );
}
