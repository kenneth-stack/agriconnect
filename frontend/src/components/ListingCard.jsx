import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, img, naira, useMeta, EMOJI } from '../api.js';

export function Thumb({ id, category, alt }) {
  return id ? <img className="cover" src={img(id)} alt={alt} loading="lazy" /> : <div className="cover ph" aria-hidden>{EMOJI[category] || '🚜'}</div>;
}

function OrderForm({ l, user, onSent }) {
  const { states, deliveryFees } = useMeta();
  const canWallet = ['buyer', 'investor'].includes(user.role);
  const [f, setF] = useState({ quantity: '', fulfilment: 'delivery', delivery_state: user.state || '', payment_method: canWallet ? 'wallet' : 'pod', note: '' });
  const [balance, setBalance] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (canWallet) api('/wallet').then((w) => setBalance(w.balance)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const items = (Number(f.quantity) || 0) * l.price;
  const fee = f.fulfilment === 'pickup' || !f.delivery_state ? 0 : f.delivery_state === l.state ? deliveryFees.same : deliveryFees.other;
  const total = items + fee;
  const short = f.payment_method === 'wallet' && balance !== null && total > balance;

  async function submit(e) {
    e.preventDefault(); setErr('');
    try { onSent(await api('/orders', { method: 'POST', body: f })); } catch (er) { setErr(er.message); }
  }
  return (
    <form onSubmit={submit} className="stack order-form">
      <label>How many {l.unit}?<input type="number" min="1" max={l.quantity} step="any" value={f.quantity} onChange={set('quantity')} required /></label>
      <fieldset className="choices"><legend>Get it by</legend>
        <label className="choice"><input type="radio" name={`f${l.id}`} checked={f.fulfilment === 'delivery'} onChange={() => setF({ ...f, fulfilment: 'delivery' })} /> Delivery</label>
        <label className="choice"><input type="radio" name={`f${l.id}`} checked={f.fulfilment === 'pickup'} onChange={() => setF({ ...f, fulfilment: 'pickup' })} /> Pickup (no delivery fee)</label>
      </fieldset>
      {f.fulfilment === 'delivery' && (
        <label>Deliver to (state)<select value={f.delivery_state} onChange={set('delivery_state')} required><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select></label>
      )}
      <label>Address or note<input value={f.note} onChange={set('note')} placeholder="Street, landmark, phone" /></label>
      <fieldset className="choices"><legend>Payment</legend>
        {canWallet && <label className="choice"><input type="radio" name={`p${l.id}`} checked={f.payment_method === 'wallet'} onChange={() => setF({ ...f, payment_method: 'wallet' })} /> Pay now from my wallet{balance !== null && ` (${naira(balance)})`}</label>}
        <label className="choice"><input type="radio" name={`p${l.id}`} checked={f.payment_method === 'pod'} onChange={() => setF({ ...f, payment_method: 'pod' })} /> Pay on delivery</label>
      </fieldset>
      <dl className="sum"><div><dt>Produce</dt><dd>{naira(items)}</dd></div><div><dt>Delivery fee</dt><dd>{f.fulfilment === 'pickup' ? 'Free (pickup)' : f.delivery_state ? naira(fee) : 'Choose a state'}</dd></div><div className="tot"><dt>Total</dt><dd>{naira(total)}</dd></div></dl>
      {short && <p className="error" role="alert">Your wallet balance is too low. <Link to="/wallet">Add money by transfer</Link> or choose pay on delivery.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn" disabled={short}>{f.payment_method === 'wallet' ? `Pay ${naira(total)} now` : 'Place order'}</button>
    </form>
  );
}

export default function ListingCard({ l, user, compact, onDeleted }) {
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const mine = user?.id === l.farmer_id;
  async function del() {
    if (!window.confirm(`Delete "${l.title}" and its photos? This cannot be undone.`)) return;
    try { await api(`/listings/${l.id}`, { method: 'DELETE' }); setGone(true); onDeleted?.(); }
    catch (e) { setMsg({ err: e.message }); }
  }
  if (gone) return null;
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
          open ? <OrderForm l={l} user={user} onSent={(r) => { setMsg({ ok: `Order sent. Total ${naira(r.total)} (includes ${naira(r.delivery_fee)} delivery). Track it under History.` }); setOpen(false); }} />
               : <button className="btn" onClick={() => { setOpen(true); setMsg(null); }}>Order</button>
        ) : !user ? <Link className="btn" to="/login">Log in to order</Link> : null
      )}
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}{msg?.err && <p className="error" role="alert">{msg.err}</p>}
      {!compact && user && (user.id === l.farmer_id || user.role === 'admin') && <button className="ghost danger" onClick={del}>Delete</button>}
    </article>
  );
}
