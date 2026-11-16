import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, naira, when } from '../api.js';

const QUICK = {
  farmer: [['🌾 Upload produce or farm photos', '/my-farm'], ['💰 Ask for funding', '/investment'], ['🚜 Hire equipment', '/equipment']],
  investor: [['💰 Farms to fund', '/investment'], ['📜 My investments', '/history']],
  buyer: [['🛒 Find produce near me', '/marketplace'], ['🚜 Hire equipment', '/equipment'], ['📜 My orders', '/history']],
  admin: [['🛠️ Admin portal', '/admin'], ['🛒 Marketplace', '/marketplace']]
};

export default function Dashboard({ user }) {
  const [h, setH] = useState(null);
  useEffect(() => { if (user) api('/me/history').then(setH).catch(() => {}); }, [user]);
  if (!user) return <Navigate to="/login" />;

  const stat = (label, value) => <div className="card stat"><b>{value}</b><span>{label}</span></div>;
  return (
    <>
      <h2>Hello, {user.name.split(' ')[0]}</h2>
      <p className="muted">Signed in as {user.role}{user.state ? ` · ${user.state}` : ''}</p>
      <div className="paths">{QUICK[user.role].map(([l, to]) => <Link key={to} to={to} className="path">{l}</Link>)}</div>
      {h && (
        <>
          <div className="grid stats">
            {stat('Completed trades', h.orders.filter((o) => o.status === 'completed').length)}
            {stat('Open orders', h.orders.filter((o) => ['pending', 'confirmed'].includes(o.status)).length)}
            {user.role === 'investor' && stat('Total invested', naira(h.investments.reduce((s, i) => s + i.amount, 0)))}
            {stat('Equipment bookings', h.bookings.length)}
          </div>
          <h3>Recent activity</h3>
          <ul className="timeline">{h.activity.slice(0, 6).map((a) => <li key={a.id}><span>{when(a.created_at)}</span> {a.detail}</li>)}</ul>
          <Link to="/history">See your full history →</Link>
        </>
      )}
    </>
  );
}
