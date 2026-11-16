import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, naira } from '../api.js';

export default function Investment({ user }) {
  const [projects, setProjects] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [form, setForm] = useState({ title: '', crop: '', description: '', amount_needed: '' });
  const [msg, setMsg] = useState(null);
  const load = () => api('/projects').then(setProjects).catch((e) => setMsg({ err: e.message }));
  useEffect(() => { load(); }, []);

  const act = async (fn, ok) => { try { await fn(); setMsg({ ok }); load(); } catch (e) { setMsg({ err: e.message }); } };

  return (
    <>
      <h2>Fund a farm, share the harvest</h2>
      <p className="muted">Farmers ask for funding for a season; investors fund part or all of it. Profit-sharing terms are agreed per project.</p>
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}{msg?.err && <p className="error" role="alert">{msg.err}</p>}
      <div className="grid">
        {projects.map((p) => {
          const pct = Math.round((p.amount_funded / p.amount_needed) * 100);
          return (
            <article key={p.id} className="card">
              <h3>{p.title}</h3>
              <p><Link to={`/farmers/${p.farmer_id}`}>{p.farmer}</Link> · {p.state} {p.crop && `· ${p.crop}`}</p>
              {p.description && <p className="muted">{p.description}</p>}
              <progress value={pct} max="100" aria-label="Funded" />
              <p>{naira(p.amount_funded)} of {naira(p.amount_needed)} ({pct}%) · {p.investors} investor(s)</p>
              {user?.role === 'investor' && (
                <div className="row">
                  <input type="number" min="1" placeholder="Amount in ₦" onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })} />
                  <button className="btn" onClick={() => act(() => api(`/projects/${p.id}/invest`, { method: 'POST', body: { amount: amounts[p.id] } }), 'Investment recorded. See it in your history.')}>Invest</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!projects.length && <p className="muted">No farms are asking for funding right now.</p>}
      {!user && <p><Link className="btn" to="/login?role=investor">Register as an investor</Link></p>}
      {user?.role === 'farmer' && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); act(() => api('/projects', { method: 'POST', body: form }), 'Funding request published.'); }}>
          <h3>Ask for funding</h3>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Crop<input value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} /></label>
          <label>Details<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Amount needed (₦)<input type="number" min="1" value={form.amount_needed} onChange={(e) => setForm({ ...form, amount_needed: e.target.value })} required /></label>
          <button className="btn">Publish request</button>
        </form>
      )}
    </>
  );
}
