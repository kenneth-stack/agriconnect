import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, useMeta } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Kyc({ user, onDone }) {
  const { states, idTypes } = useMeta();
  const nav = useNavigate();
  const [k, setK] = useState(null);
  const [f, setF] = useState({ dob: '', phone: '', address: '', state: user?.state || '', lga: '', id_type: '', id_number: '', bvn: '' });
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    api('/kyc/me').then((d) => { setK(d); if (d.status !== 'none') setF((x) => ({ ...x, dob: d.dob || '', phone: d.phone || '', address: d.address || '', state: d.state || x.state, lga: d.lga || '', id_type: d.id_type || '' })); }).catch(() => {});
  }, []);
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'admin') return <Navigate to="/admin" />;
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const locked = k?.status === 'verified';
  const has = k && k.status !== 'none';

  async function submit(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/kyc', { method: 'PUT', body: f }); onDone('submitted'); nav('/dashboard'); }
    catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <form className="card kyc" onSubmit={submit}>
      <h2>Your KYC profile</h2>
      {!k || k.status === 'none' ? <p className="notice">Please complete this profile before you buy, sell, invest or request assistance. It takes about two minutes.</p> : null}
      {k?.status === 'submitted' && <p className="notice">Your profile has been submitted and is waiting for review. You can continue using AgriConnect.</p>}
      {k?.status === 'verified' && <p className="notice good">Your profile is verified. ✔</p>}
      {k?.status === 'rejected' && <p className="notice bad">Your profile was not approved{k.review_note ? `: ${k.review_note}` : ''}. Please correct it and submit again.</p>}
      <fieldset disabled={locked} className="stack">
        <div className="row">
          <label className="grow">Date of birth<input type="date" value={f.dob} onChange={set('dob')} required /></label>
          <label className="grow">Phone number<input type="tel" value={f.phone} onChange={set('phone')} placeholder="0801 234 5678" required /></label>
        </div>
        <label>Home or farm address<input value={f.address} onChange={set('address')} required /></label>
        <div className="row">
          <label className="grow">State<select value={f.state} onChange={set('state')} required><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="grow">Local government area<input value={f.lga} onChange={set('lga')} /></label>
        </div>
        <div className="row">
          <label className="grow">ID type<select value={f.id_type} onChange={set('id_type')} required><option value="">Choose…</option>{idTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
          <div className="grow"><PasswordInput label={`ID number${has && k.id_last4 ? ` (saved: ends ${k.id_last4})` : ''}`} value={f.id_number} onChange={set('id_number')} required={!has} autoComplete="off" /></div>
        </div>
        <PasswordInput label={`BVN, 11 digits${has && k.bvn_last4 ? ` (saved: ends ${k.bvn_last4})` : ''}`} value={f.bvn} onChange={set('bvn')} required={!has} inputMode="numeric" maxLength={11} autoComplete="off" />
        <p className="muted">Your BVN and ID number are stored encrypted and are only shown to our verification team. {has && 'Leave them blank to keep the saved ones.'}</p>
      </fieldset>
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}
      {!locked && <button className="btn">{has ? 'Update profile' : 'Submit profile'}</button>}
    </form>
  );
}
