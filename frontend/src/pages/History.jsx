import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, naira, when } from '../api.js';
import { monthsLabel } from '../components/Plans.jsx';

export default function History({ user }) {
  const [h, setH] = useState(null);
  const [tab, setTab] = useState('trades');
  const [err, setErr] = useState('');
  useEffect(() => { if (user) api('/me/history').then(setH).catch((e) => setErr(e.message)); }, [user]);
  if (!user) return <Navigate to="/login" />;
  if (err) return <p className="error">{err}</p>;
  if (!h) return <p className="muted">Loading…</p>;

  const tabs = [
    ['trades', `Trades (${h.orders.length})`],
    ...(user.role === 'investor' ? [['investments', `Investments (${h.investments.length})`]] : []),
    ...(user.role === 'farmer' ? [['assistance', `Assistance (${h.assistance.length})`]] : []),
    ['bookings', `Equipment (${h.bookings.length})`], ['activity', 'All activity']
  ];
  const Empty = ({ n }) => (n ? null : <p className="muted">Nothing here yet.</p>);
  const Badge = ({ s }) => <span className={'badge ' + s}>{s}</span>;

  return (
    <>
      <h2>My history</h2>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="table-wrap">
        {tab === 'trades' && <><Empty n={h.orders.length} /><table><tbody>{h.orders.map((o) => (
          <tr key={o.id}><td>{when(o.created_at)}</td><td>{o.side === 'buying' ? `Bought from ${o.farmer}` : `Sold to ${o.buyer}`}</td><td>{o.quantity} {o.unit} {o.title}</td><td>{naira(o.total)}</td><td><Badge s={o.status} /></td></tr>))}</tbody></table></>}
        {tab === 'investments' && <><Empty n={h.investments.length} /><table><tbody>{h.investments.map((i) => (
          <tr key={i.id}><td>{when(i.created_at)}</td><td>{monthsLabel(i.duration_months)} at {i.rate_percent}%</td><td>{naira(i.amount)}</td><td>{i.maturity_date ? `Matures ${when(i.maturity_date)}` : 'Not started'}</td><td><Badge s={i.display_status} /></td></tr>))}</tbody></table></>}
        {tab === 'assistance' && <><Empty n={h.assistance.length} /><table><tbody>{h.assistance.map((a) => (
          <tr key={a.id}><td>{when(a.created_at)}</td><td>{a.item}</td><td>{a.quantity} {a.unit}</td><td><Badge s={a.status} /></td><td className="muted">{a.admin_note}</td></tr>))}</tbody></table></>}
        {tab === 'bookings' && <><Empty n={h.bookings.length} /><table><tbody>{h.bookings.map((b) => (
          <tr key={b.id}><td>{b.name}</td><td>{b.start_date} to {b.end_date}</td><td>{naira(b.total)}</td><td><Badge s={b.status} /></td></tr>))}</tbody></table></>}
        {tab === 'activity' && <ul className="timeline">{h.activity.map((a) => <li key={a.id}><span>{when(a.created_at)}</span> {a.detail}</li>)}</ul>}
      </div>
    </>
  );
}
