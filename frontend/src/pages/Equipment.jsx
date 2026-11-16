import { useEffect, useState } from 'react';
import { api, naira } from '../api.js';

export default function Equipment({ user }) {
  const [items, setItems] = useState([]);
  const [dates, setDates] = useState({});
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/equipment').then(setItems).catch((e) => setMsg(e.message)); }, []);

  async function book(id) {
    try { await api(`/equipment/${id}/book`, { method: 'POST', body: dates[id] || {} }); setMsg('Booking requested. The owner will confirm.'); }
    catch (e) { setMsg(e.message); }
  }
  const setDate = (id, k) => (x) => setDates({ ...dates, [id]: { ...dates[id], [k]: x.target.value } });

  return (
    <>
      <h2>Hire tractors, drones and harvesters</h2>
      {msg && <p role="status">{msg}</p>}
      <div className="grid">
        {items.map((e) => (
          <article key={e.id} className="card">
            <h3>{e.name}</h3>
            <p>{e.type}, {e.state}, {e.owner}</p>
            <p className="price">{naira(e.price_per_day)} <small>per day</small></p>
            {user && ['farmer', 'buyer'].includes(user.role) && (
              <div className="row">
                <input type="date" aria-label="Start date" onChange={setDate(e.id, 'start_date')} />
                <input type="date" aria-label="End date" onChange={setDate(e.id, 'end_date')} />
                <button className="btn" onClick={() => book(e.id)}>Book</button>
              </div>
            )}
          </article>
        ))}
        {!items.length && <p className="muted">No equipment listed yet. Providers can register and add machines.</p>}
      </div>
    </>
  );
}
