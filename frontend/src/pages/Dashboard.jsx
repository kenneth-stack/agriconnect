import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, naira, when } from '../api.js';
import Countdown from '../components/Countdown.jsx';
import Plans, { monthsLabel } from '../components/Plans.jsx';
import { WalletBox } from '../components/WalletCard.jsx';

const QUICK = {
  farmer: [['🌾 Upload produce or farm photos', '/my-farm'], ['🤝 Request assistance', '/assistance'], ['🚜 Hire equipment', '/equipment']],
  buyer: [['🛒 Find produce near me', '/marketplace'], ['🚜 Hire equipment', '/equipment'], ['📜 My orders', '/history']],
  admin: [['🛠️ Admin portal', '/admin'], ['🛒 Marketplace', '/marketplace']]
};
const LABEL = { active: 'Active', matured: 'Matured', paid: 'Paid out', cancelled: 'Cancelled' };

function InvestmentCard({ i }) {
  const start = Date.parse(i.start_date), end = Date.parse(i.maturity_date);
  const pct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
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
    </article>
  );
}

function InvestorDashboard({ user }) {
  const [h, setH] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tick, setTick] = useState(0);
  const load = () => api('/me/history').then(setH).catch(() => {});
  useEffect(() => { load(); api('/plans').then(setPlans).catch(() => {}); }, []);
  const inv = (h?.investments || []).filter((i) => i.display_status !== 'cancelled');
  const live = inv.filter((i) => ['active', 'matured'].includes(i.display_status));
  const sum = (arr, k) => arr.reduce((s, i) => s + i[k], 0);
  const stat = (label, value) => <div className="card stat"><b>{value}</b><span>{label}</span></div>;
  return (
    <>
      <WalletBox key={tick} />
      <div className="grid stats">
        {stat('Total invested', naira(sum(live, 'amount')))}
        {stat('Expected returns', naira(sum(live, 'expected_return')))}
        {stat('Active plans', live.length)}
      </div>
      <h3>My investments</h3>
      {h && !inv.length && <p className="muted">You have not started an investment yet. Add money to your wallet, then pick a plan below.</p>}
      <div className="grid">{inv.map((i) => <InvestmentCard key={i.id} i={i} />)}</div>
      <h3>Start a new investment</h3>
      <Plans user={user} plans={plans} onInvested={() => { load(); setTick((t) => t + 1); }} />
    </>
  );
}

export default function Dashboard({ user }) {
  const [h, setH] = useState(null);
  const unlocked = Boolean(user) && (user.role === 'admin' || ['submitted', 'verified'].includes(user.kyc));
  useEffect(() => { if (user && unlocked && user.role !== 'investor') api('/me/history').then(setH).catch(() => {}); }, [user, unlocked]);
  if (!user) return <Navigate to="/login" />;
  if (!unlocked) { // nothing on the dashboard works until KYC is done (the bar at the top links to the KYC page)
    const tiles = QUICK[user.role] || [['💰 Invest in a plan'], ['👛 Wallet and account number']];
    return (
      <>
        <h2>Hello, {user.name.split(' ')[0]}</h2>
        <p className="muted">Your dashboard is locked until you complete your KYC profile. <Link to="/kyc">Complete it now</Link></p>
        <div className="paths">{tiles.map(([l]) => <span key={l} className="path off" aria-disabled="true">🔒 {l.replace(/^\S+\s/, '')}</span>)}</div>
      </>
    );
  }
  const stat = (label, value) => <div className="card stat"><b>{value}</b><span>{label}</span></div>;
  return (
    <>
      <h2>Hello, {user.name.split(' ')[0]}</h2>
      <p className="muted">Signed in as {user.role}{user.state ? ` · ${user.state}` : ''}</p>
      {user.role === 'investor' ? <InvestorDashboard user={user} /> : (
        <>
          {user.role === 'buyer' && <WalletBox />}
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
    </>
  );
}
