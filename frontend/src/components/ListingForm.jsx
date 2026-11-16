import { useState } from 'react';
import { api, useMeta, EMOJI } from '../api.js';
import PhotoPicker from './PhotoPicker.jsx';

// Used by farmers (own produce) and by admins (pass `farmers` to upload on a farmer's behalf)
export default function ListingForm({ farmers, onDone }) {
  const { categories, units } = useMeta();
  const empty = { farmer_id: '', category: '', title: '', description: '', quantity: '', unit: 'kg', price: '' };
  const [f, setF] = useState(empty);
  const [files, setFiles] = useState([]);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setMsg(null);
    if (!f.category) return setMsg({ err: 'Pick a category first.' });
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => v !== '' && fd.append(k, v));
    files.forEach((x) => fd.append('images', x));
    try {
      await api('/listings', { method: 'POST', body: fd });
      setMsg({ ok: 'Produce published.' }); setF(empty); setFiles([]); onDone?.();
    } catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Upload produce</h3>
      {farmers && (
        <label>Farmer
          <select value={f.farmer_id} onChange={set('farmer_id')} required>
            <option value="">Choose a farmer…</option>
            {farmers.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.state})</option>)}
          </select>
        </label>
      )}
      <div role="tablist" aria-label="Category" className="tabs">
        {categories.map((c) => (
          <button type="button" role="tab" aria-selected={f.category === c} key={c} className={f.category === c ? 'tab on' : 'tab'} onClick={() => setF({ ...f, category: c })}>
            {EMOJI[c]} {c}
          </button>
        ))}
      </div>
      <label>Produce name<input value={f.title} onChange={set('title')} placeholder="e.g. Brown rice" required /></label>
      <label>Description (optional)<textarea rows="2" value={f.description} onChange={set('description')} /></label>
      <div className="row">
        <label className="grow">Quantity<input type="number" min="0" step="any" value={f.quantity} onChange={set('quantity')} required /></label>
        <label>Unit<select value={f.unit} onChange={set('unit')}>{units.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="grow">Price per unit (₦)<input type="number" min="0" step="any" value={f.price} onChange={set('price')} required /></label>
      </div>
      <PhotoPicker files={files} onChange={setFiles} max={4} label="Add produce photos" />
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
      <button className="btn">Publish produce</button>
    </form>
  );
}
