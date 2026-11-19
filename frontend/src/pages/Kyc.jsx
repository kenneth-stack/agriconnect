import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, useMeta } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

const blankFarm = (state = '') => ({ name: '', address: '', state, lga: '', size_ha: '', main_crops: '', latitude: '', longitude: '' });

// Fills in the farm's coordinates from the phone's GPS. The farmer should be standing on the farm.
function GpsButton({ onFix }) {
  const [msg, setMsg] = useState('');
  function go() {
    if (!navigator.geolocation) return setMsg('This browser cannot share your location. Type the coordinates instead.');
    setMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => { onFix(p.coords.latitude.toFixed(6), p.coords.longitude.toFixed(6)); setMsg(`Captured (accurate to about ${Math.round(p.coords.accuracy)} m).`); },
      (e) => setMsg(e.code === 1 ? 'Location permission was denied. Allow it in your browser settings, or type the coordinates.' : 'Could not get your location. Try again outdoors, or type the coordinates.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }
  return <div><button type="button" className="ghost" onClick={go}>📍 Capture GPS location (stand on the farm)</button> {msg && <span className="muted small">{msg}</span>}</div>;
}

function FarmsEditor({ farms, onChange, states }) {
  const set = (i, patch) => onChange(farms.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="stack">
      {farms.map((f, i) => (
        <fieldset key={i} className="farm-card">
          <legend>Farm {i + 1}</legend>
          <label>Farm name (optional)<input value={f.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="e.g. Epe rice farm" /></label>
          <label>Farm location / address<input value={f.address} onChange={(e) => set(i, { address: e.target.value })} required /></label>
          <div className="row">
            <label className="grow">State<select value={f.state} onChange={(e) => set(i, { state: e.target.value })} required><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="grow">Local government area<input value={f.lga} onChange={(e) => set(i, { lga: e.target.value })} /></label>
          </div>
          <div className="row">
            <label className="grow">Size (hectares)<input type="number" min="0" step="any" value={f.size_ha} onChange={(e) => set(i, { size_ha: e.target.value })} /></label>
            <label className="grow">Main crops<input value={f.main_crops} onChange={(e) => set(i, { main_crops: e.target.value })} placeholder="Rice, maize" /></label>
          </div>
          <div className="row">
            <label className="grow">Latitude<input type="number" step="any" value={f.latitude} onChange={(e) => set(i, { latitude: e.target.value })} /></label>
            <label className="grow">Longitude<input type="number" step="any" value={f.longitude} onChange={(e) => set(i, { longitude: e.target.value })} /></label>
          </div>
          <GpsButton onFix={(latitude, longitude) => set(i, { latitude, longitude })} />
          {f.latitude !== '' && f.longitude !== '' && <a href={`https://www.google.com/maps?q=${f.latitude},${f.longitude}`} target="_blank" rel="noreferrer">View this spot on a map</a>}
          {farms.length > 1 && <button type="button" className="ghost danger" onClick={() => onChange(farms.filter((_, j) => j !== i))}>Remove this farm</button>}
        </fieldset>
      ))}
      <button type="button" className="ghost" onClick={() => onChange([...farms, blankFarm(farms[farms.length - 1]?.state)])}>+ Add another farm</button>
    </div>
  );
}

export default function Kyc({ user, onDone }) {
  const { states, idTypes } = useMeta();
  const nav = useNavigate();
  const [k, setK] = useState(null);
  const [f, setF] = useState({ dob: '', phone: '', address: '', state: user?.state || '', lga: '', id_type: '', id_number: '', bvn: '' });
  const [farms, setFarms] = useState([blankFarm(user?.state || '')]);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    api('/kyc/me').then((d) => {
      setK(d);
      if (d.status !== 'none') setF((x) => ({ ...x, dob: d.dob || '', phone: d.phone || '', address: d.address || '', state: d.state || x.state, lga: d.lga || '', id_type: d.id_type || '' }));
      if (d.farms?.length) setFarms(d.farms.map((m) => ({ name: m.name || '', address: m.address || '', state: m.state || '', lga: m.lga || '', size_ha: m.size_ha ?? '', main_crops: m.main_crops || '', latitude: m.latitude ?? '', longitude: m.longitude ?? '' })));
    }).catch(() => {});
  }, []);
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'admin') return <Navigate to="/admin" />;
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const isFarmer = user.role === 'farmer';
  const locked = k?.status === 'verified';
  const has = k && k.status !== 'none';

  async function submit(e) {
    e.preventDefault(); setMsg(null);
    try {
      if (locked) { await api('/kyc/farms', { method: 'PUT', body: { farms } }); setMsg({ ok: 'Farms saved.' }); return; } // a verified profile can still add farms
      await api('/kyc', { method: 'PUT', body: { ...f, ...(isFarmer ? { farms } : {}) } });
      onDone('submitted'); nav('/dashboard');
    } catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <form className="card kyc" onSubmit={submit}>
      <h2>Your KYC profile</h2>
      {!has && <p className="notice">Complete this profile to get full access: buying, selling, investing and requesting assistance. It takes about two minutes.</p>}
      {k?.status === 'submitted' && <p className="notice">Your profile has been submitted and is waiting for review. You can continue using AgriConnect.</p>}
      {k?.status === 'verified' && <p className="notice good">Your profile is verified. ✔{isFarmer && ' You can still add or edit your farms below.'}</p>}
      {k?.status === 'rejected' && <p className="notice bad">Your profile was not approved{k.review_note ? `: ${k.review_note}` : ''}. Please correct it and submit again.</p>}
      <fieldset disabled={locked} className="stack">
        <div className="row">
          <label className="grow">Date of birth<input type="date" value={f.dob} onChange={set('dob')} required /></label>
          <label className="grow">Phone number<input type="tel" value={f.phone} onChange={set('phone')} placeholder="0801 234 5678" required /></label>
        </div>
        <label>House address<input value={f.address} onChange={set('address')} required /></label>
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
      {isFarmer && (
        <>
          <h3>Your farms</h3>
          <p className="muted">Add every farm you work on. Tap “Capture GPS location” while standing on the farm so buyers, investors and our team can find it. Exact GPS positions are only visible to you and our verification team.</p>
          <FarmsEditor farms={farms} onChange={setFarms} states={states} />
        </>
      )}
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}{msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
      {(!locked || isFarmer) && <button className="btn">{locked ? 'Save farms' : has ? 'Update profile' : 'Submit profile'}</button>}
    </form>
  );
}
