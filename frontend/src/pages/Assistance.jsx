import { useEffect, useState } from 'react';
import { api, useMeta, when } from '../api.js';

export default function Assistance({ user }) {
  const { assistanceItems, assistanceUnits } = useMeta();
  const empty = { item: '', quantity: '', unit: 'bag', description: '' };
  const [f, setF] = useState(empty);
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = () => user?.role === 'farmer' && api('/assistance/mine').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (user?.role !== 'farmer') return <p>Assistance and funding requests are for farmer accounts. Our admin team reviews every request.</p>;

  async function submit(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/assistance', { method: 'POST', body: f }); setMsg({ ok: 'Request sent. Our team will review it and you will see the decision below.' }); setF(empty); load(); }
    catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <>
      <h2>Assistance / Funding</h2>
      <p className="muted">Tell us what you need for your farm. An admin reviews each request and approves or rejects it.</p>
      <form className="card narrow wide" onSubmit={submit}>
        <label>What do you need?
          <select value={f.item} onChange={set('item')} required><option value="">Choose from the list…</option>{assistanceItems.map((i) => <option key={i}>{i}</option>)}</select>
        </label>
        <div className="row">
          <label className="grow">Quantity<input type="number" min="0" step="any" value={f.quantity} onChange={set('quantity')} required /></label>
          <label>Unit<select value={f.unit} onChange={set('unit')}>{assistanceUnits.map((u) => <option key={u} value={u}>{u === 'naira' ? '₦ (cash amount)' : u}</option>)}</select></label>
        </div>
        <label>Describe what you need and why<textarea rows="4" value={f.description} onChange={set('description')} placeholder="e.g. 40 bags of manure for 2 hectares of maize, planting in March" /></label>
        {msg?.err && <p className="error" role="alert">{msg.err}</p>}{msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
        <button className="btn">Submit request</button>
      </form>
      <h3>My requests</h3>
      {!list.length && <p className="muted">You have not made any requests yet.</p>}
      <div className="table-wrap"><table><tbody>
        {list.map((a) => (
          <tr key={a.id}><td>{when(a.created_at)}</td><td><b>{a.item}</b><br /><span className="muted">{a.quantity} {a.unit}{a.description ? ` · ${a.description}` : ''}</span></td>
            <td><span className={'badge ' + a.status}>{a.status}</span></td><td className="muted">{a.admin_note}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
