import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, naira, when, useMeta } from '../api.js';
import ChangePassword from '../components/ChangePassword.jsx';
import Countdown from '../components/Countdown.jsx';
import Plans, { monthsLabel } from '../components/Plans.jsx';

const QUICK = {
  farmer: [['🌾 Upload produce or farm photos', '/my-farm'], ['🤝 Request assistance', '/assistance'], ['🚜 Hire equipment', '/equipment']],
  buyer: [['🛒 Find produce near me', '/marketplace'], ['🚜 Hire equipment', '/equipment'], ['📜 My orders', '/history']],
  admin: [['🛠️ Admin portal', '/admin'], ['🛒 Marketplace', '/marketplace']]
};
const LABEL = { pending: 'Awaiting payment', active: 'Active', matured: 'Matured', paid: 'Paid out', cancelled: 'Cancelled' };

function InvestmentCard({ i }) {
  const { paymentNote } = useMeta();
  const start = Date.parse(i.start_date), end = Date.parse(i.maturity_date);
  const pct = i.start_date ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
  return (
    <article className="card inv">
      <div className="inv-top"><b>{monthsLabel(i.duration_months)}</b><span className={'badge ' + i.display_status}>{LABEL[i.display_status]}</span></div>
      <div className="inv-amt">{naira(i.amount)}</div>
      <p className="muted">{i.rate_percent}% per year · expected payout <b>{naira(i.amount + i.expected_return)}</b></p>
      {i.display_status === 'active' && <>
        <p className="muted small">Time left until maturity</p><Countdown to={i.maturity_date} />
        <div className="bar" aria-hidden><i style={{ width: pct + '%' }} /></div>
        <p className="muted small">Started {when(i.start_date)} · matures {when(i.maturity_date)}</p>
      </>}
      {i.display_status === 'matured' && <p className="ok">Matured on {when(i.maturity_date)}. Your payout is being processed.</p>}
      {i.display_status === 'paid' && <p className="ok">Paid out. Thank you for investing.</p>}
      {i.display_status === 'pending' && <p className="muted">Waiting for us to confirm your payment. Your countdown starts then. {paymentNote}</p>}
    </article>
  );
}

function InvestorDashboard({ user }) {
  const [h, setH] = useState(null);
  const [plans, setPlans] = useState([]);
  const load = () => api('/me/history').then(setH).catch(() => {});
  useEffect(() => { load(); api('/plans').then(setPlans).catch(() => {}); }, []);
  const inv = h?.investments || [];
  const live = inv.filter((i) => ['active', 'matured'].includes(i.display_status));
  const sum = (arr, k) => arr.reduce((s, i) => s + i[k], 0);
  return (
    <>
      <section className="wallet" aria-label="Investment summary">
        <p>Total invested</p>
        <h2>{naira(sum(live, 'amount'))}</h2>
        <div className="wallet-row">
          <div><span>Expected returns</span><b>{naira(sum(live, 'expected_return'))}</b></div>
          <div><span>Active plans</span><b>{live.length}</b></div>
          <div><span>Awaiting payment</span><b>{inv.filter((i) => i.display_status === 'pending').length}</b></div>
        </div>
      </section>
      <h3>My investments</h3>
      {h && !inv.length && <p className="muted">You have not started an investment yet. Pick a plan below.</p>}
      <div className="grid">{inv.filter((i) => i.display_status !== 'cancelled').map((i) => <InvestmentCard key={i.id} i={i} />)}</div>
      <h3>Start a new investment</h3>
      <Plans user={user} plans={plans} onInvested={load} />
    </>
  );
}

export default function Dashboard({ user }) {
  const [h, setH] = useState(null);
  useEffect(() => { if (user && user.role !== 'investor') api('/me/history').then(setH).catch(() => {}); }, [user]);
  if (!user) return <Navigate to="/login" />;
  const stat = (label, value) => <div className="card stat"><b>{value}</b><span>{label}</span></div>;
  return (
    <>
      <h2>Hello, {user.name.split(' ')[0]}</h2>
      <p className="muted">Signed in as {user.role}{user.state ? ` · ${user.state}` : ''}</p>
      {user.role === 'investor' ? <InvestorDashboard user={user} /> : (
        <>
          <div className="paths">{QUICK[user.role].map(([l, to]) => <Link key={to} to={to} className="path">{l}</Link>)}</div>
          {h && (
            <>
              <div className="grid stats">
                {stat('Completed trades', h.orders.filter((o) => o.status === 'completed').length)}
                {stat('Open orders', h.orders.filter((o) => ['pending', 'confirmed'].includes(o.status)).length)}
                {user.role === 'farmer' && stat('Pending assistance requests', h.assistance.filter((a) => a.status === 'pending').length)}
                {stat('Equipment bookings', h.bookings.length)}
              </div>
              <h3>Recent activity</h3>
              <ul className="timeline">{h.activity.slice(0, 6).map((a) => <li key={a.id}><span>{when(a.created_at)}</span> {a.detail}</li>)}</ul>
              <Link to="/history">See your full history →</Link>
            </>
          )}
        </>
      )}
      <ChangePassword />
    </>
  );
}
