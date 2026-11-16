import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, naira, when, useMeta } from '../api.js';
import ListingForm from '../components/ListingForm.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';

const TABS = ['Overview', 'Upload produce', 'Farmers & users', 'Equipment', 'Bookings', 'Orders', 'Activity'];

export default function Admin({ user }) {
  const [tab, setTab] = useState('Overview');
  if (user?.role !== 'admin') return <Navigate to="/" />;
  return (
    <>
      <h2>Admin portal</h2>
      <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Overview' && <Overview />}
      {tab === 'Upload produce' && <Produce />}
      {tab === 'Farmers & users' && <Users />}
      {tab === 'Equipment' && <EquipmentAdmin />}
      {tab === 'Bookings' && <Bookings />}
      {tab === 'Orders' && <Orders />}
      {tab === 'Activity' && <Activity />}
    </>
  );
}

function useLoad(path) {
  const [d, setD] = useState(null);
  const load = () => api(path).then(setD).catch(() => setD([]));
  useEffect(() => { load(); }, [path]);
  return [d, load];
}
const Msg = ({ m }) => m && <p className={m.err ? 'error' : 'ok'} role="status">{m.err || m.ok}</p>;

function Overview() {
  const [o] = useLoad('/admin/overview');
  if (!o) return <p className="muted">Loading…</p>;
  const n = (arr, k, v) => arr.find((x) => x[k] === v)?.n || 0;
  const stat = (l, v) => <div className="card stat"><b>{v}</b><span>{l}</span></div>;
  return <div className="grid stats">
    {stat('Farmers', n(o.users, 'role', 'farmer'))}{stat('Investors', n(o.users, 'role', 'investor'))}{stat('Buyers', n(o.users, 'role', 'buyer'))}
    {stat('Produce listings', o.listings)}{stat('Equipment for hire', o.equipment)}
    {stat('Pending orders', n(o.orders, 'status', 'pending'))}{stat('Completed trade value', naira(o.traded))}{stat('Total invested', naira(o.invested))}
  </div>;
}

function Produce() {
  const [farmers] = useLoad('/farmers');
  const [list, reload] = useLoad('/listings');
  const [m, setM] = useState(null);
  const [files, setFiles] = useState([]);
  const [farmerId, setFarmerId] = useState('');
  return (
    <>
      <p className="muted">Upload produce, or farm photos, on behalf of a farmer.</p>
      {farmers && <ListingForm farmers={farmers} onDone={reload} />}
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(); fd.append('farmer_id', farmerId); files.forEach((f) => fd.append('images', f));
        try { await api('/farm/photos', { method: 'POST', body: fd }); setM({ ok: 'Farm photos uploaded.' }); setFiles([]); } catch (er) { setM({ err: er.message }); }
      }}>
        <h3>Upload farm photos for a farmer</h3>
        <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required aria-label="Farmer"><option value="">Choose a farmer…</option>{farmers?.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.state})</option>)}</select>
        <PhotoPicker files={files} onChange={setFiles} max={6} label="Add farm photos" />
        {files.length > 0 && <button className="btn">Upload</button>}<Msg m={m} />
      </form>
      <h3>All produce on sale</h3>
      <div className="table-wrap"><table><tbody>{list?.map((l) => (
        <tr key={l.id}><td>{l.title}</td><td>{l.category}</td><td>{l.farmer} ({l.state})</td><td>{l.quantity} {l.unit}</td><td>{naira(l.price)}</td>
          <td><button className="ghost" onClick={() => api(`/listings/${l.id}`, { method: 'DELETE' }).then(reload)}>Remove</button></td></tr>))}</tbody></table></div>
    </>
  );
}

function Users() {
  const { states } = useMeta();
  const [users, reload] = useLoad('/admin/users');
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', state: '' });
  const [m, setM] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        try { await api('/admin/farmers', { method: 'POST', body: f }); setM({ ok: 'Farmer registered. Share the login details with them.' }); setF({ name: '', email: '', password: '', phone: '', state: '' }); reload(); }
        catch (er) { setM({ err: er.message }); }
      }}>
        <h3>Register a farmer on their behalf</h3>
        <div className="row">
          <label className="grow">Name<input value={f.name} onChange={set('name')} required /></label>
          <label className="grow">Email<input type="email" value={f.email} onChange={set('email')} required /></label>
        </div>
        <div className="row">
          <label className="grow">Phone<input value={f.phone} onChange={set('phone')} /></label>
          <label className="grow">State<select value={f.state} onChange={set('state')} required><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="grow">Temporary password<input value={f.password} minLength={8} onChange={set('password')} required /></label>
        </div>
        <button className="btn">Register farmer</button><Msg m={m} />
      </form>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>State</th><th>Email</th><th>Phone</th><th>Joined</th></tr></thead>
        <tbody>{users?.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.role}</td><td>{u.state}</td><td>{u.email}</td><td>{u.phone}</td><td>{when(u.created_at)}</td></tr>)}</tbody></table></div>
    </>
  );
}

function EquipmentAdmin() {
  const { equipmentTypes, states } = useMeta();
  const [list, reload] = useLoad('/equipment');
  const [f, setF] = useState({ name: '', type: '', state: '', description: '', price_per_day: '' });
  const [files, setFiles] = useState([]);
  const [m, setM] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(); Object.entries(f).forEach(([k, v]) => v && fd.append(k, v)); files.forEach((x) => fd.append('images', x));
        try { await api('/equipment', { method: 'POST', body: fd }); setM({ ok: 'Equipment added.' }); setF({ name: '', type: '', state: '', description: '', price_per_day: '' }); setFiles([]); reload(); }
        catch (er) { setM({ err: er.message }); }
      }}>
        <h3>Add equipment for hire</h3>
        <label>Name<input value={f.name} onChange={set('name')} placeholder="e.g. Massey Ferguson 290 tractor" required /></label>
        <div className="row">
          <label className="grow">Type<select value={f.type} onChange={set('type')} required><option value="">Choose…</option>{equipmentTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="grow">Based in<select value={f.state} onChange={set('state')}><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="grow">Price per day (₦)<input type="number" min="1" value={f.price_per_day} onChange={set('price_per_day')} required /></label>
        </div>
        <label>Description<textarea rows="2" value={f.description} onChange={set('description')} /></label>
        <PhotoPicker files={files} onChange={setFiles} max={3} label="Add equipment photos" />
        <button className="btn">Add equipment</button><Msg m={m} />
      </form>
      <div className="table-wrap"><table><tbody>{list?.map((e) => (
        <tr key={e.id}><td>{e.name}</td><td>{e.type}</td><td>{e.state}</td><td>{naira(e.price_per_day)}/day</td>
          <td><button className="ghost" onClick={() => api(`/equipment/${e.id}`, { method: 'DELETE' }).then(reload)}>Remove</button></td></tr>))}</tbody></table></div>
    </>
  );
}

function Bookings() {
  const [list, reload] = useLoad('/admin/bookings');
  const set = (id, status) => api(`/admin/bookings/${id}`, { method: 'PATCH', body: { status } }).then(reload);
  return <div className="table-wrap"><table><tbody>{list?.map((b) => (
    <tr key={b.id}><td>{b.equipment}</td><td>{b.person}</td><td>{b.start_date} to {b.end_date}</td><td>{naira(b.total)}</td><td><span className={'badge ' + b.status}>{b.status}</span></td>
      <td className="row">{b.status === 'pending' && <button className="btn" onClick={() => set(b.id, 'confirmed')}>Confirm</button>}{b.status !== 'cancelled' && <button className="ghost" onClick={() => set(b.id, 'cancelled')}>Cancel</button>}</td></tr>))}</tbody></table>
    {list && !list.length && <p className="muted">No bookings yet.</p>}</div>;
}

function Orders() {
  const [list] = useLoad('/admin/orders');
  return <div className="table-wrap"><table><tbody>{list?.map((o) => (
    <tr key={o.id}><td>#{o.id} · {when(o.created_at)}</td><td>{o.buyer} → {o.farmer}</td><td>{o.quantity} {o.unit} {o.title}</td><td>{naira(o.total)}</td><td><span className={'badge ' + o.status}>{o.status}</span></td></tr>))}</tbody></table>
    {list && !list.length && <p className="muted">No orders yet.</p>}</div>;
}

function Activity() {
  const [list] = useLoad('/admin/activity');
  return <ul className="timeline">{list?.map((a) => <li key={a.id}><span>{when(a.created_at)}</span> <b>{a.name}</b> ({a.role}): {a.detail}</li>)}</ul>;
}
