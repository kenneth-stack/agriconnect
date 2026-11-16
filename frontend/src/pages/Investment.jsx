import { useEffect, useState } from 'react';
import { api, naira } from '../api.js';

export default function Investment({ user }) {
  const [projects, setProjects] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [form, setForm] = useState({ title: '', crop: '', state: '', description: '', amount_needed: '' });
  const [msg, setMsg] = useState('');
  const load = () => api('/projects').then(setProjects).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  async function invest(id) {
    try { await api(`/projects/${id}/invest`, { method: 'POST', body: { amount: amounts[id] } }); setMsg('Investment recorded.'); load(); }
    catch (e) { setMsg(e.message); }
  }
  async function create(e) {
    e.preventDefault();
    try { await api('/projects', { method: 'POST', body: form }); setMsg('Funding request published.'); load(); }
    catch (e2) { setMsg(e2.message); }
  }

  return (
    <>
      <h2>Fund a farm, share the harvest</h2>
      <p className="muted">Illustrative profit split: 45% investor, 40% farmer, 15% platform. Final terms depend on crop, risk and insurance.</p>
      {msg && <p role="status">{msg}</p>}
      <div className="grid">
        {projects.map((p) => {
          const pct = Math.round((p.amount_funded / p.amount_needed) * 100);
          return (
            <article key={p.id} className="card">
              <h3>{p.title}</h3>
              <p>{p.crop}, {p.state}, by {p.farmer}</p>
              <progress value={pct} max="100" aria-label="Funded" />
              <p>{naira(p.amount_funded)} of {naira(p.amount_needed)} funded ({pct}%)</p>
              {user?.role === 'investor' && (
                <div className="row">
                  <input type="number" placeholder="Amount in ₦" onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })} />
                  <button className="btn" onClick={() => invest(p.id)}>Invest</button>
                </div>
              )}
            </article>
          );
        })}
        {!projects.length && <p className="muted">No open farms right now.</p>}
      </div>
      {user?.role === 'farmer' && (
        <form className="card" onSubmit={create}>
          <h3>Ask for funding</h3>
          {['title', 'crop', 'state', 'description', 'amount_needed'].map((k) => (
            <label key={k}>{k.replace('_', ' ')}<input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k === 'title' || k === 'amount_needed'} /></label>
          ))}
          <button className="btn">Publish request</button>
        </form>
      )}
    </>
  );
}
