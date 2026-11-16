import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, session } from '../api.js';

export default function Login({ onAuth }) {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('role') ? 'register' : 'login');
  const [f, setF] = useState({ name: '', email: '', password: '', role: params.get('role') || 'farmer', language: 'en' });
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr('');
    try {
      const { token, user } = await api(`/auth/${mode}`, { method: 'POST', body: f });
      session.save(token, user); onAuth(user); nav('/');
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create your account'}</h2>
      {mode === 'register' && <>
        <label>Full name<input value={f.name} onChange={set('name')} required /></label>
        <label>I am a
          <select value={f.role} onChange={set('role')}>
            <option value="farmer">Farmer</option><option value="investor">Investor</option>
            <option value="buyer">Buyer / processor</option><option value="provider">Equipment provider</option>
          </select>
        </label>
        <label>Language
          <select value={f.language} onChange={set('language')}>
            <option value="en">English</option><option value="yo">Yoruba</option><option value="ig">Igbo</option>
            <option value="ha">Hausa</option><option value="pcm">Pidgin</option>
          </select>
        </label>
      </>}
      <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
      <label>Password<input type="password" minLength={8} value={f.password} onChange={set('password')} required /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn">{mode === 'login' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
