import { useState } from 'react';
import { api } from '../api.js';
import PasswordInput from './PasswordInput.jsx';

export default function ChangePassword() {
  const [f, setF] = useState({ current_password: '', new_password: '' });
  const [m, setM] = useState(null);
  return (
    <form className="card narrow" onSubmit={async (e) => {
      e.preventDefault();
      try { await api('/auth/change-password', { method: 'POST', body: f }); setM({ ok: 'Password changed.' }); setF({ current_password: '', new_password: '' }); }
      catch (er) { setM({ err: er.message }); }
    }}>
      <h3>Change password</h3>
      <PasswordInput label="Current password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} required />
      <PasswordInput label="New password (8+ characters)" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} minLength={8} required />
      {m?.err && <p className="error" role="alert">{m.err}</p>}{m?.ok && <p className="ok" role="status">{m.ok}</p>}
      <button className="btn">Update password</button>
    </form>
  );
}
