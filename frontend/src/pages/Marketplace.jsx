import { useEffect, useState } from 'react';
import { api, naira } from '../api.js';

export default function Marketplace({ user }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ title: '', category: 'vegetables', quantity: '', unit: 'kg', price: '', state: '' });
  const [msg, setMsg] = useState('');
  const load = () => api(`/listings?q=${encodeURIComponent(q)}`).then(setItems).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  async function post(e) {
    e.preventDefault();
    try { await api('/listings', { method: 'POST', body: form }); setMsg('Listing published.'); load(); }
    catch (e2) { setMsg(e2.message); }
  }

  return (
    <>
      <h2>Buy produce directly from farmers</h2>
      <div className="row">
        <input placeholder="Search rice, tomatoes, palm oil…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={load}>Search</button>
      </div>
      {msg && <p role="status">{msg}</p>}
      <div className="grid">
        {items.map((i) => (
          <article key={i.id} className="card">
            <h3>{i.title}</h3>
            <p className="price">{naira(i.price)} <small>per {i.unit}</small></p>
            <p>{i.quantity} {i.unit} available, {i.state || 'Nigeria'}</p>
            <p className="muted">Sold by {i.seller}</p>
          </article>
        ))}
        {!items.length && <p className="muted">No produce listed yet. Farmers can post the first listing below.</p>}
      </div>
      {user?.role === 'farmer' && (
        <form className="card" onSubmit={post}>
          <h3>List your produce</h3>
          {['title', 'quantity', 'unit', 'price', 'state'].map((k) => (
            <label key={k}>{k}<input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k === 'title' || k === 'price'} /></label>
          ))}
          <button className="btn">Publish listing</button>
        </form>
      )}
    </>
  );
}
