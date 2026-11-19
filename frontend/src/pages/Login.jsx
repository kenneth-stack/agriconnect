import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, session, useMeta } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Login({ onAuth }) {
  const [params] = useSearchParams();
  const { states } = useMeta();
  const [mode, setMode] = useState(params.get('role') ? 'register' : 'login');
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', state: '', role: params.get('role') || 'farmer', language: 'en' });
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const needsState = ['farmer', 'buyer'].includes(f.role);

  async function submit(e) {
    e.preventDefault(); setErr('');
    try {
      const { token, user } = await api(`/auth/${mode}`, { method: 'POST', body: f });
      session.save(token, user); onAuth(user);
      // everyone except admins must complete their KYC profile first
      nav('/dashboard'); // people without a KYC profile see a banner there asking them to complete it
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create your account'}</h2>
      {mode === 'register' && <>
        <label>I am a
          <select value={f.role} onChange={set('role')}>
            <option value="farmer">Farmer</option><option value="investor">Investor</option><option value="buyer">Buyer / processor</option>
          </select>
        </label>
        <label>Full name<input value={f.name} onChange={set('name')} required /></label>
        <label>Phone (optional)<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        {needsState && (
          <label>Your state{f.role === 'farmer' ? ' (where your farm is)' : ' (where you want delivery)'}
            <select value={f.state} onChange={set('state')} required><option value="">Choose a state…</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        )}
      </>}
      <label>Email<input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
      <PasswordInput value={f.password} onChange={set('password')} minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      {mode === 'login' && <Link to="/forgot-password" className="small">Forgot password?</Link>}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn">{mode === 'login' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
