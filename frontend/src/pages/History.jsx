import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, naira, when } from '../api.js';

export default function History({ user }) {
  const [h, setH] = useState(null);
  const [tab, setTab] = useState('trades');
  const [err, setErr] = useState('');
  useEffect(() => { if (user) api('/me/history').then(setH).catch((e) => setErr(e.message)); }, [user]);
  if (!user) return <Navigate to="/login" />;
  if (err) return <p className="error">{err}</p>;
  if (!h) return <p className="muted">Loading…</p>;

  const tabs = [['trades', `Trades (${h.orders.length})`], ['money', `Investments & funding (${h.investments.length + h.projects.length})`], ['bookings', `Equipment (${h.bookings.length})`], ['activity', 'All activity']];
  const Empty = ({ n }) => (n ? null : <p className="muted">Nothing here yet.</p>);

  return (
    <>
      <h2>My history</h2>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="table-wrap">
        {tab === 'trades' && <><Empty n={h.orders.length} /><table><tbody>{h.orders.map((o) => (
          <tr key={o.id}><td>{when(o.created_at)}</td><td>{o.side === 'buying' ? `Bought from ${o.farmer}` : `Sold to ${o.buyer}`}</td><td>{o.quantity} {o.unit} {o.title}</td><td>{naira(o.total)}</td><td><span className={'badge ' + o.status}>{o.status}</span></td></tr>))}</tbody></table></>}
        {tab === 'money' && <><Empty n={h.investments.length + h.projects.length} /><table><tbody>
          {h.investments.map((i) => <tr key={'i' + i.id}><td>{when(i.created_at)}</td><td>Invested in {i.title} ({i.farmer})</td><td>{naira(i.amount)}</td><td><span className={'badge ' + i.status}>{i.status}</span></td></tr>)}
          {h.projects.map((p) => <tr key={'p' + p.id}><td>{when(p.created_at)}</td><td>Funding request: {p.title}</td><td>{naira(p.amount_funded)} of {naira(p.amount_needed)}</td><td><span className={'badge ' + p.status}>{p.status}</span></td></tr>)}
        </tbody></table></>}
        {tab === 'bookings' && <><Empty n={h.bookings.length} /><table><tbody>{h.bookings.map((b) => (
          <tr key={b.id}><td>{b.name}</td><td>{b.start_date} to {b.end_date}</td><td>{naira(b.total)}</td><td><span className={'badge ' + b.status}>{b.status}</span></td></tr>))}</tbody></table></>}
        {tab === 'activity' && <ul className="timeline">{h.activity.map((a) => <li key={a.id}><span>{when(a.created_at)}</span> {a.detail}</li>)}</ul>}
      </div>
    </>
  );
}
