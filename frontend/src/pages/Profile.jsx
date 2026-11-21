import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, shrink, useMeta, when } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import ChangePassword from '../components/ChangePassword.jsx';

export default function Profile({ user, onChange }) {
  const { states } = useMeta();
  const file = useRef();
  const [p, setP] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', state: '' });
  const [pay, setPay] = useState({ bank_name: '', account_number: '', account_name: '' });
  const [msg, setMsg] = useState(null);
  const load = () => api('/profile').then((d) => { setP(d); setForm({ name: d.name, phone: d.phone || '', state: d.state || '' }); if (d.payout) setPay(d.payout); }).catch((e) => setMsg({ err: e.message }));
  useEffect(() => { if (user) load(); }, []);
  if (!user) return <Navigate to="/login" />;
  if (!p) return <p className="muted">Loading…</p>;
  const run = async (fn, ok) => { setMsg(null); try { await fn(); setMsg({ ok }); await load(); } catch (e) { setMsg({ err: e.message }); } };

  async function upload(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const fd = new FormData(); fd.append('image', await shrink(f, 600));
    run(async () => { const r = await api('/profile/avatar', { method: 'POST', body: fd }); onChange({ ...user, avatar: r.avatar_id }); }, 'Profile picture updated.');
  }
  const row = (label, value) => value ? <div><dt>{label}</dt><dd>{value}</dd></div> : null;

  return (
    <>
      <h2>My profile</h2>
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}{msg?.err && <p className="error" role="alert">{msg.err}</p>}
      <section className="split">
        <div className="card profile-card">
          <Avatar id={p.avatar_id} name={p.name} size={120} />
          <h3>{p.name}</h3>
          <span className="badge">{p.role}</span>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
          <div className="row">
            <button className="btn" onClick={() => file.current.click()}>{p.avatar_id ? 'Change picture' : 'Upload picture'}</button>
            {p.avatar_id && <button className="ghost" onClick={() => window.confirm('Remove your profile picture?') && run(async () => { await api('/profile/avatar', { method: 'DELETE' }); onChange({ ...user, avatar: null }); }, 'Picture removed.')}>Remove</button>}
          </div>
          <dl className="details">
            {row('Email', p.email)}{row('State', p.state)}{row('Phone', p.phone)}{row('Member since', when(p.created_at))}
            {p.role !== 'admin' && <div><dt>KYC</dt><dd><span className={'badge ' + p.kyc.status}>{p.kyc.status === 'none' ? 'not started' : p.kyc.status}</span> <Link to="/kyc">{p.kyc.status === 'none' ? 'Complete it' : 'View / update'}</Link></dd></div>}
            {p.kyc.status !== 'none' && <>{row('Date of birth', p.kyc.dob)}{row('Address', p.kyc.address)}{row('ID', `${p.kyc.id_type} ••••${p.kyc.id_last4}`)}{row('BVN', `••••••${p.kyc.bvn_last4}`)}</>}
          </dl>
          {['investor', 'buyer'].includes(p.role) && <Link to="/wallet">Open my wallet →</Link>}
        </div>
        <div className="stack">
          <form className="card" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/profile', { method: 'PUT', body: form }); onChange({ ...user, name: form.name, state: form.state || user.state }); }, 'Details saved.'); }}>
            <h3>Edit details</h3>
            <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Phone<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            {p.role !== 'investor' && p.role !== 'admin' && <label>State<select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select></label>}
            <button className="btn">Save</button>
          </form>
          {p.role !== 'admin' && (
            <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => api('/profile/payout', { method: 'PUT', body: pay }), 'Payout account saved.'); }}>
              <h3>{p.role === 'farmer' ? 'Payout account' : 'Withdrawal account'}</h3>
              <p className="muted small">{p.role === 'farmer' ? 'When a buyer pays from their wallet, AgriConnect sends your money to this account after delivery.' : 'Money you withdraw from your wallet is sent to this account.'}</p>
              <label>Bank<input value={pay.bank_name || ''} onChange={(e) => setPay({ ...pay, bank_name: e.target.value })} required /></label>
              <label>Account number (10 digits)<input inputMode="numeric" maxLength={10} value={pay.account_number || ''} onChange={(e) => setPay({ ...pay, account_number: e.target.value })} required /></label>
              <label>Account name<input value={pay.account_name || ''} onChange={(e) => setPay({ ...pay, account_name: e.target.value })} required /></label>
              <button className="btn">Save payout account</button>
            </form>
          )}
          {p.role === 'farmer' && (
            <div className="card">
              <h3>My farms</h3>
              {!p.farms.length && <p className="muted">No farms added yet.</p>}
              {p.farms.map((f) => (
                <p key={f.id}><b>{f.name}</b><br /><span className="muted">{f.address}, {f.state}{f.size_ha ? ` · ${f.size_ha} ha` : ''}{f.main_crops ? ` · ${f.main_crops}` : ''}</span>
                  {f.latitude != null && <><br /><a href={`https://www.google.com/maps?q=${f.latitude},${f.longitude}`} target="_blank" rel="noreferrer">📍 {f.latitude}, {f.longitude}</a></>}</p>
              ))}
              <Link to="/kyc">Add or edit farms</Link>
            </div>
          )}
          <ChangePassword />
        </div>
      </section>
    </>
  );
}
