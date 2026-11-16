import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, naira, useMeta } from '../api.js';
import { Thumb } from '../components/ListingCard.jsx';

export default function Equipment({ user }) {
  const { equipmentTypes } = useMeta();
  const [type, setType] = useState('');
  const [items, setItems] = useState([]);
  const [dates, setDates] = useState({});
  const [msg, setMsg] = useState(null);
  useEffect(() => { api('/equipment?type=' + encodeURIComponent(type)).then(setItems).catch((e) => setMsg({ err: e.message })); }, [type]);
  const setDate = (id, k) => (e) => setDates({ ...dates, [id]: { ...dates[id], [k]: e.target.value } });
  const canBook = user && ['farmer', 'buyer'].includes(user.role);

  async function book(id) {
    try { await api(`/equipment/${id}/book`, { method: 'POST', body: dates[id] || {} }); setMsg({ ok: 'Booking requested. We will confirm shortly; track it under History.' }); }
    catch (e) { setMsg({ err: e.message }); }
  }

  return (
    <>
      <h2>Hire tractors, drones and harvesters</h2>
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Equipment type">
        <option value="">All equipment</option>{equipmentTypes.map((t) => <option key={t}>{t}</option>)}
      </select>
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}{msg?.err && <p className="error" role="alert">{msg.err}</p>}
      <div className="grid">
        {items.map((e) => (
          <article key={e.id} className="card">
            <Thumb id={e.image_id} category="" alt={e.name} />
            <h3>{e.name}</h3>
            <p>{e.type}{e.state && ` · ${e.state}`}</p>
            {e.description && <p className="muted">{e.description}</p>}
            <p className="price">{naira(e.price_per_day)} <small>per day</small></p>
            {canBook && (
              <div className="row">
                <input type="date" aria-label="Start date" onChange={setDate(e.id, 'start_date')} />
                <input type="date" aria-label="End date" onChange={setDate(e.id, 'end_date')} />
                <button className="btn" onClick={() => book(e.id)}>Book</button>
              </div>
            )}
            {!user && <Link className="btn" to="/login">Log in to book</Link>}
          </article>
        ))}
      </div>
      {!items.length && <p className="muted">No equipment listed yet. Our team adds machines for hire here.</p>}
    </>
  );
}
