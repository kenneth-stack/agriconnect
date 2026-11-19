import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, img, naira, when, useMeta } from '../api.js';
import ListingForm from '../components/ListingForm.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import { monthsLabel } from '../components/Plans.jsx';

const TABS = ['Overview', 'KYC', 'Assistance', 'Investments', 'Payouts', 'Wallets', 'Plans & fees', 'Upload produce', 'Farmers & users', 'Equipment', 'Bookings', 'Orders', 'Activity', 'Admins'];

export default function Admin({ user }) {
  const [tab, setTab] = useState('Overview');
  if (user?.role !== 'admin') return <Navigate to="/" />;
  return (
    <>
      <h2>Admin portal</h2>
      <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Overview' && <Overview />}
      {tab === 'KYC' && <KycAdmin />}
      {tab === 'Assistance' && <AssistanceAdmin />}
      {tab === 'Investments' && <InvestmentsAdmin />}
      {tab === 'Payouts' && <PayoutsAdmin />}
      {tab === 'Wallets' && <WalletsAdmin />}
      {tab === 'Plans & fees' && <><PlansAdmin /><FeesAdmin /></>}
      {tab === 'Upload produce' && <Produce />}
      {tab === 'Farmers & users' && <Users />}
      {tab === 'Equipment' && <EquipmentAdmin />}
      {tab === 'Bookings' && <Bookings />}
      {tab === 'Orders' && <Orders />}
      {tab === 'Activity' && <Activity />}
      {tab === 'Admins' && <Admins me={user} />}
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
  const [farm, loadFarm] = useLoad(farmerId ? `/farmers/${farmerId}` : '/meta');
  const del = (text, fn) => window.confirm(text) && fn().then(() => { reload(); loadFarm(); }).catch((e) => window.alert(e.message));
  return (
    <>
      <p className="muted">Upload produce, or farm photos, on behalf of a farmer. You can also delete anything uploaded.</p>
      {farmers && <ListingForm farmers={farmers} onDone={reload} />}
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(); fd.append('farmer_id', farmerId); files.forEach((f) => fd.append('images', f));
        try { await api('/farm/photos', { method: 'POST', body: fd }); setM({ ok: 'Farm photos uploaded.' }); setFiles([]); loadFarm(); } catch (er) { setM({ err: er.message }); }
      }}>
        <h3>Farm photos for a farmer</h3>
        <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required aria-label="Farmer"><option value="">Choose a farmer…</option>{farmers?.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.state})</option>)}</select>
        {farmerId && farm?.photos && <div className="thumbs">{farm.photos.map((p) => (
          <span className="thumb" key={p.id}><img src={img(p.id)} alt="Farm" /><button type="button" aria-label="Delete photo" onClick={() => del('Delete this farm photo?', () => api(`/images/${p.id}`, { method: 'DELETE' }))}>×</button></span>
        ))}</div>}
        <PhotoPicker files={files} onChange={setFiles} max={6} label="Add farm photos" />
        {files.length > 0 && <button className="btn">Upload</button>}<Msg m={m} />
      </form>
      <h3>All produce on sale</h3>
      <div className="table-wrap"><table><tbody>{list?.map((l) => (
        <tr key={l.id}>
          <td><div className="thumbs">{(l.image_ids || []).map((id) => (
            <span className="thumb" key={id}><img src={img(id)} alt={l.title} /><button type="button" aria-label="Delete photo" onClick={() => del('Delete this photo?', () => api(`/images/${id}`, { method: 'DELETE' }))}>×</button></span>
          ))}</div></td>
          <td><b>{l.title}</b><br /><span className="muted small">{l.category}</span></td><td>{l.farmer} ({l.state})</td><td>{l.quantity} {l.unit}</td><td>{naira(l.price)}</td>
          <td><button className="ghost" onClick={() => del(`Delete "${l.title}" and all its photos?`, () => api(`/listings/${l.id}`, { method: 'DELETE' }))}>Delete</button></td></tr>))}</tbody></table></div>
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
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>State</th><th>Email</th><th>Phone</th><th>Joined</th><th></th></tr></thead>
        <tbody>{users?.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.role}</td><td>{u.state}</td><td>{u.email}</td><td>{u.phone}</td><td>{when(u.created_at)}</td><td>{u.role !== 'admin' && <button className="ghost" onClick={() => { const p = window.prompt(`New temporary password for ${u.name} (8+ characters)`); if (p) api(`/admin/users/${u.id}/password`, { method: 'PATCH', body: { password: p } }).then(() => window.alert('Password set. Share it with them privately.')).catch((e) => window.alert(e.message)); }}>Set password</button>}{u.role !== 'admin' && <button className="ghost danger" onClick={() => window.confirm(`Delete the account of ${u.name}? Their personal data, photos, KYC and farms are erased. This cannot be undone.`) && api(`/admin/users/${u.id}`, { method: 'DELETE' }).then(reload).catch((e) => window.alert(e.message))}>Delete</button>}</td></tr>)}</tbody></table></div>
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
          <td><button className="ghost" onClick={() => window.confirm(`Delete ${e.name} and its photos?`) && api(`/equipment/${e.id}`, { method: 'DELETE' }).then(reload).catch((er) => window.alert(er.message))}>Delete</button></td></tr>))}</tbody></table></div>
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
  const PAY = { held: 'Paid (held)', released: 'Paid', refunded: 'Refunded', pay_on_delivery: 'Pay on delivery', collected: 'Collected' };
  return <div className="table-wrap"><table><tbody>{list?.map((o) => (
    <tr key={o.id}><td>#{o.id} · {when(o.created_at)}</td><td>{o.buyer} → {o.farmer}</td><td>{o.quantity} {o.unit} {o.title}</td>
      <td>{naira(o.total)}<br /><span className="muted small">incl. {naira(o.delivery_fee)} delivery</span></td><td><span className={'badge ' + o.status}>{o.status}</span><br /><span className="muted small">{PAY[o.payment_status]}</span></td></tr>))}</tbody></table>
    {list && !list.length && <p className="muted">No orders yet.</p>}</div>;
}

function Activity() {
  const [list] = useLoad('/admin/activity');
  return <ul className="timeline">{list?.map((a) => <li key={a.id}><span>{when(a.created_at)}</span> <b>{a.name}</b> ({a.role}): {a.detail}</li>)}</ul>;
}

function Admins({ me }) {
  const [list, reload] = useLoad('/admin/admins');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [m, setM] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        try { await api('/admin/admins', { method: 'POST', body: f }); setM({ ok: 'Admin created. Share the temporary password privately and ask them to change it after logging in.' }); setF({ name: '', email: '', password: '' }); reload(); }
        catch (er) { setM({ err: er.message }); }
      }}>
        <h3>Add another admin</h3>
        <p className="muted">Admins can upload produce, add equipment, register farmers and see all activity. Only add people you trust.</p>
        <div className="row">
          <label className="grow">Name<input value={f.name} onChange={set('name')} required /></label>
          <label className="grow">Email<input type="email" value={f.email} onChange={set('email')} required /></label>
          <label className="grow">Temporary password<input value={f.password} minLength={8} onChange={set('password')} required /></label>
        </div>
        <button className="btn">Create admin</button><Msg m={m} />
      </form>
      <h3>Current admins</h3>
      <div className="table-wrap"><table><tbody>{list?.map((a) => (
        <tr key={a.id}><td>{a.name}{a.id === me.id && ' (you)'}</td><td>{a.email}</td><td>Since {when(a.created_at)}</td>
          <td>{a.id !== me.id && <button className="ghost" onClick={() => window.confirm(`Remove admin access for ${a.name}?`) && api(`/admin/admins/${a.id}`, { method: 'DELETE' }).then(reload)}>Remove access</button>}</td></tr>))}</tbody></table></div>
    </>
  );
}

function KycAdmin() {
  const [list, reload] = useLoad('/admin/kyc');
  const review = async (id, status) => {
    let note = null;
    if (status === 'rejected') { note = window.prompt('Reason for rejecting (the user will see this):'); if (note === null) return; }
    await api(`/admin/kyc/${id}`, { method: 'PATCH', body: { status, note } }); reload();
  };
  const reveal = async (id) => {
    const r = await api(`/admin/kyc/${id}/reveal`);
    const farms = (r.farms || []).map((f, i) => `  ${i + 1}. ${f.name}: ${f.address}, ${f.lga ? f.lga + ', ' : ''}${f.state}${f.size_ha ? ` (${f.size_ha} ha)` : ''}${f.latitude != null ? `\n     GPS ${f.latitude}, ${f.longitude}  https://www.google.com/maps?q=${f.latitude},${f.longitude}` : ''}`).join('\n');
    window.alert(`BVN: ${r.bvn}\nID number: ${r.id_number}\nPhone: ${r.phone}\nHouse address: ${r.address}${farms ? `\n\nFarms:\n${farms}` : ''}\n\nThis view has been logged.`);
  };
  return <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>State</th><th>ID</th><th>BVN</th><th>Status</th><th></th></tr></thead><tbody>{list?.map((k) => (
    <tr key={k.user_id}><td>{k.name}<br /><span className="muted">{k.email}</span></td><td>{k.role}</td><td>{k.state}</td><td>{k.id_type} ••••{k.id_last4}</td><td>••••••{k.bvn_last4}</td>
      <td><span className={'badge ' + k.status}>{k.status}</span>{k.review_note && <><br /><span className="muted">{k.review_note}</span></>}</td>
      <td className="row"><button className="ghost" onClick={() => reveal(k.user_id)}>View full</button>
        {k.status !== 'verified' && <button className="btn" onClick={() => review(k.user_id, 'verified')}>Verify</button>}
        {k.status !== 'rejected' && <button className="ghost" onClick={() => review(k.user_id, 'rejected')}>Reject</button>}</td></tr>))}</tbody></table>
    {list && !list.length && <p className="muted">No KYC profiles yet.</p>}</div>;
}

function AssistanceAdmin() {
  const [list, reload] = useLoad('/admin/assistance');
  const decide = async (id, status) => {
    const note = window.prompt(status === 'approved' ? 'Note for the farmer (optional), e.g. where to collect:' : 'Reason for rejecting (the farmer will see this):');
    if (note === null) return;
    try { await api(`/admin/assistance/${id}`, { method: 'PATCH', body: { status, note } }); reload(); } catch (e) { window.alert(e.message); }
  };
  return <div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Request</th><th>Status</th><th></th></tr></thead><tbody>{list?.map((a) => (
    <tr key={a.id}><td>{a.farmer}<br /><span className="muted">{a.state} · {a.phone}</span></td>
      <td><b>{a.item}</b> · {a.quantity} {a.unit}<br /><span className="muted">{a.description}</span><br /><span className="muted">{when(a.created_at)}</span></td>
      <td><span className={'badge ' + a.status}>{a.status}</span>{a.admin_note && <><br /><span className="muted">{a.admin_note}</span></>}</td>
      <td className="row">{a.status === 'pending' && <><button className="btn" onClick={() => decide(a.id, 'approved')}>Approve</button><button className="ghost" onClick={() => decide(a.id, 'rejected')}>Reject</button></>}</td></tr>))}</tbody></table>
    {list && !list.length && <p className="muted">No applications yet.</p>}</div>;
}

function InvestmentsAdmin() {
  const [list, reload] = useLoad('/admin/investments');
  const act = (id, action, text) => window.confirm(text) && api(`/admin/investments/${id}`, { method: 'PATCH', body: { action } }).then(reload).catch((e) => window.alert(e.message));
  return <>
    <p className="muted">Investors pay from their wallets and the countdown starts straight away. When a plan matures, pay the investor into their wallet (principal + return), or click <b>Mark paid</b> if you paid them another way.</p>
    <div className="table-wrap"><table><thead><tr><th>Investor</th><th>Plan</th><th>Amount</th><th>Expected payout</th><th>Status</th><th></th></tr></thead><tbody>{list?.map((i) => (
      <tr key={i.id}><td>{i.investor}<br /><span className="muted">{when(i.created_at)}</span></td><td>{monthsLabel(i.duration_months)} at {i.rate_percent}%</td><td>{naira(i.amount)}</td><td>{naira(i.amount + i.expected_return)}</td>
        <td><span className={'badge ' + i.display_status}>{i.display_status}</span>{i.maturity_date && <><br /><span className="muted">Matures {when(i.maturity_date)}</span></>}</td>
        <td className="row">{i.display_status === 'matured' && <>
          <button className="btn" onClick={() => act(i.id, 'wallet', `Pay ${naira(i.amount + i.expected_return)} into ${i.investor}'s wallet?`)}>Pay into wallet</button>
          <button className="ghost" onClick={() => act(i.id, 'paid', 'Mark as paid (you paid them outside the app)?')}>Mark paid</button></>}</td></tr>))}</tbody></table>
      {list && !list.length && <p className="muted">No investments yet.</p>}</div></>;
}

function PlansAdmin() {
  const [list, reload] = useLoad('/admin/plans');
  const [edit, setEdit] = useState({});
  const [f, setF] = useState({ duration_months: '', rate_percent: '', min_amount: '' });
  const [m, setM] = useState(null);
  const val = (p, k) => edit[p.id]?.[k] ?? p[k];
  const put = (p, k) => (e) => setEdit({ ...edit, [p.id]: { ...edit[p.id], [k]: k === 'active' ? e.target.checked : e.target.value } });
  return <>
    <p className="muted">Set the yearly rate and minimum for each plan. Changes apply to <b>new</b> investments only. Existing investors keep the rate they signed up with. The starting rates are placeholders: set your real ones before launch.</p>
    <div className="table-wrap"><table><thead><tr><th>Duration</th><th>Rate % per year</th><th>Minimum (₦)</th><th>Active</th><th></th></tr></thead><tbody>{list?.map((p) => (
      <tr key={p.id}><td>{monthsLabel(p.duration_months)}</td>
        <td><input type="number" step="any" value={val(p, 'rate_percent')} onChange={put(p, 'rate_percent')} /></td>
        <td><input type="number" value={val(p, 'min_amount')} onChange={put(p, 'min_amount')} /></td>
        <td><input type="checkbox" checked={val(p, 'active')} onChange={put(p, 'active')} aria-label="Active" /></td>
        <td><button className="btn" onClick={() => api(`/admin/plans/${p.id}`, { method: 'PATCH', body: edit[p.id] || {} }).then(() => { setEdit({ ...edit, [p.id]: undefined }); reload(); })}>Save</button></td></tr>))}</tbody></table></div>
    <form className="card" onSubmit={async (e) => {
      e.preventDefault();
      try { await api('/admin/plans', { method: 'POST', body: f }); setM({ ok: 'Plan added.' }); setF({ duration_months: '', rate_percent: '', min_amount: '' }); reload(); } catch (er) { setM({ err: er.message }); }
    }}>
      <h3>Add a plan</h3>
      <div className="row">
        <label className="grow">Months<input type="number" min="1" max="120" value={f.duration_months} onChange={(e) => setF({ ...f, duration_months: e.target.value })} required /></label>
        <label className="grow">Rate % per year<input type="number" step="any" value={f.rate_percent} onChange={(e) => setF({ ...f, rate_percent: e.target.value })} required /></label>
        <label className="grow">Minimum (₦)<input type="number" value={f.min_amount} onChange={(e) => setF({ ...f, min_amount: e.target.value })} required /></label>
      </div>
      <button className="btn">Add plan</button><Msg m={m} />
    </form></>;
}

function PayoutsAdmin() {
  const [list, reload] = useLoad('/admin/payouts');
  return <>
    <p className="muted">When a buyer pays from their wallet and the farmer completes the order, the item price is owed to the farmer. Pay it to the account shown, then click <b>Mark paid</b>. The delivery fee stays with AgriConnect to cover delivery.</p>
    <div className="table-wrap"><table><thead><tr><th>Order</th><th>Farmer</th><th>Pay to</th><th>Amount</th><th></th></tr></thead><tbody>{list?.map((p) => (
      <tr key={p.id}><td>#{p.id} · {p.title}</td><td>{p.farmer}<br /><span className="muted small">{p.phone}</span></td>
        <td>{p.account_number ? <>{p.bank_name}<br /><b>{p.account_number}</b><br /><span className="muted small">{p.account_name}</span></> : <span className="muted">No payout account yet</span>}</td>
        <td>{naira(p.amount)}</td>
        <td>{p.payout_status === 'pending' ? <button className="btn" onClick={() => window.confirm(`Mark ${naira(p.amount)} as paid to ${p.farmer}?`) && api(`/admin/payouts/${p.id}`, { method: 'PATCH', body: {} }).then(reload).catch((e) => window.alert(e.message))}>Mark paid</button> : <span className="badge paid">paid</span>}</td></tr>))}</tbody></table>
      {list && !list.length && <p className="muted">Nothing to pay out.</p>}</div></>;
}

function WalletsAdmin() {
  const [users] = useLoad('/admin/users');
  const [txs, reload] = useLoad('/admin/wallet/transactions');
  const [f, setF] = useState({ user_id: '', amount: '', note: '' });
  const [m, setM] = useState(null);
  const TX = { transfer_in: 'Money added', order_payment: 'Order payment', refund: 'Refund', investment: 'Investment', investment_payout: 'Investment payout', admin_credit: 'Admin credit' };
  return <>
    <form className="card" onSubmit={async (e) => {
      e.preventDefault();
      try { await api('/admin/wallet/credit', { method: 'POST', body: f }); setM({ ok: 'Wallet credited.' }); setF({ user_id: '', amount: '', note: '' }); reload(); } catch (er) { setM({ err: er.message }); }
    }}>
      <h3>Credit a wallet manually</h3>
      <p className="muted small">For corrections or testing, for example if a transfer was received but did not appear. Every credit is recorded.</p>
      <div className="row">
        <label className="grow">Investor or buyer<select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} required><option value="">Choose…</option>{users?.filter((u) => ['investor', 'buyer'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></label>
        <label className="grow">Amount (₦)<input type="number" min="1" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></label>
        <label className="grow">Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <button className="btn">Credit wallet</button><Msg m={m} />
    </form>
    <h3>Recent wallet activity</h3>
    <div className="table-wrap"><table><tbody>{txs?.map((t) => (
      <tr key={t.id}><td>{when(t.created_at)}</td><td>{t.name} <span className="muted small">({t.role})</span></td><td>{TX[t.type] || t.type}<br /><span className="muted small">{t.description}</span></td>
        <td className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount < 0 ? '−' : '+'}{naira(Math.abs(t.amount))}</td></tr>))}</tbody></table>
      {txs && !txs.length && <p className="muted">No wallet activity yet.</p>}</div></>;
}

function FeesAdmin() {
  const [fees] = useLoad('/admin/fees');
  const [f, setF] = useState(null);
  const [m, setM] = useState(null);
  const v = f || fees;
  if (!v || Array.isArray(v)) return null;
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault();
      try { await api('/admin/fees', { method: 'PUT', body: v }); setM({ ok: 'Delivery fees saved.' }); } catch (er) { setM({ err: er.message }); }
    }}>
      <h3>Delivery fees (per order)</h3>
      <p className="muted small">Added to the price when a buyer chooses delivery. Pickup is always free. The starting amounts are placeholders: set your real ones.</p>
      <div className="row">
        <label className="grow">Same state as the farmer (₦)<input type="number" min="0" value={v.same} onChange={(e) => setF({ ...v, same: e.target.value })} required /></label>
        <label className="grow">Different state (₦)<input type="number" min="0" value={v.other} onChange={(e) => setF({ ...v, other: e.target.value })} required /></label>
      </div>
      <button className="btn">Save fees</button><Msg m={m} />
    </form>
  );
}
