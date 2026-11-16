import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, img, naira, EMOJI } from '../api.js';

export function Thumb({ id, category, alt }) {
  return id ? <img className="cover" src={img(id)} alt={alt} loading="lazy" /> : <div className="cover ph" aria-hidden>{EMOJI[category] || '🚜'}</div>;
}

export default function ListingCard({ l, user, compact }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ quantity: '', delivery_state: user?.state || '', note: '' });
  const [msg, setMsg] = useState(null);
  const mine = user?.id === l.farmer_id;

  async function order(e) {
    e.preventDefault();
    try {
      const r = await api('/orders', { method: 'POST', body: { listing_id: l.id, ...f } });
      setMsg({ ok: `Order sent. Total ${naira(r.total)}. The farmer will confirm; track it under History.` }); setOpen(false);
    } catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <article className="card listing">
      <Thumb id={l.image_id} category={l.category} alt={l.title} />
      <h3>{l.title}</h3>
      <p className="price">{naira(l.price)} <small>per {l.unit}</small></p>
      <p>{l.quantity} {l.unit} available</p>
      <p className="muted"><Link to={`/farmers/${l.farmer_id}`}>{l.farmer}</Link> · {l.state}</p>
      {!compact && l.description && <p className="muted">{l.description}</p>}
      {!compact && (
        user && user.role !== 'admin' && !mine ? (
          open ? (
            <form onSubmit={order} className="stack">
              <label>How many {l.unit}?<input type="number" min="1" max={l.quantity} step="any" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} required /></label>
              <label>Delivery note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Address or pickup details" /></label>
              <button className="btn">Send order</button>
            </form>
          ) : <button className="btn" onClick={() => setOpen(true)}>Order</button>
        ) : !user ? <Link className="btn" to="/login">Log in to order</Link> : null
      )}
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}
    </article>
  );
}
