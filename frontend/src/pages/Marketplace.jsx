import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useMeta, EMOJI } from '../api.js';
import ListingCard from '../components/ListingCard.jsx';

export default function Marketplace({ user }) {
  const { categories, states } = useMeta();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || '';
  const [state, category, farmer, q] = ['state', 'category', 'farmer', 'q'].map(get);
  const [items, setItems] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [msg, setMsg] = useState('');

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    if (k === 'state') p.delete('farmer'); // farmer list depends on the chosen location
    setParams(p, { replace: true });
  };
  useEffect(() => { api(`/farmers?state=${encodeURIComponent(state)}`).then(setFarmers).catch((e) => setMsg(e.message)); }, [state]);
  useEffect(() => { api('/listings?' + new URLSearchParams({ state, category, farmer, q })).then(setItems).catch((e) => setMsg(e.message)); }, [state, category, farmer, q]);

  const groups = category ? [[category, items]] : categories.map((c) => [c, items.filter((i) => i.category === c)]).filter(([, l]) => l.length);

  return (
    <>
      <h2>Buy produce directly from farmers</h2>
      <form className="card filters" onSubmit={(e) => e.preventDefault()}>
        <label>Your location
          <select value={state} onChange={(e) => set('state', e.target.value)}>
            <option value="">All of Nigeria</option>{states.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Pick a farmer {state && `in ${state}`}
          <select value={farmer} onChange={(e) => set('farmer', e.target.value)}>
            <option value="">Any farmer ({farmers.length})</option>
            {farmers.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.state} ({f.listings} items)</option>)}
          </select>
        </label>
        <label>Search<input value={q} onChange={(e) => set('q', e.target.value)} placeholder="rice, tomatoes, palm oil…" /></label>
        {user?.state && state !== user.state && <button type="button" className="ghost" onClick={() => set('state', user.state)}>Use my state ({user.state})</button>}
      </form>
      <div className="tabs" role="tablist" aria-label="Category">
        <button role="tab" aria-selected={!category} className={!category ? 'tab on' : 'tab'} onClick={() => set('category', '')}>All</button>
        {categories.map((c) => <button key={c} role="tab" aria-selected={category === c} className={category === c ? 'tab on' : 'tab'} onClick={() => set('category', c)}>{EMOJI[c]} {c}</button>)}
      </div>
      {msg && <p className="error">{msg}</p>}
      {!items.length && <p className="muted">No produce matches yet. Try another state, farmer or category.</p>}
      {groups.map(([c, list]) => (
        <section key={c}>
          <h3 className="cat-title">{EMOJI[c]} {c} <small>({list.length})</small></h3>
          <div className="grid">{list.map((l) => <ListingCard key={l.id} l={l} user={user} />)}</div>
        </section>
      ))}
    </>
  );
}
