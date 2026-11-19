import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, naira } from '../api.js';

export const monthsLabel = (m) => `${m} months` + (m % 12 === 0 ? ` (${m / 12} year${m > 12 ? 's' : ''})` : '');

function PlanCard({ p, user, balance, onInvested }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState(null);
  const a = Number(amount) || 0;
  const gain = a * (p.rate_percent / 100) * (p.duration_months / 12);
  const end = new Date(); end.setMonth(end.getMonth() + p.duration_months);
  const short = balance !== null && a > balance;

  async function go(e) {
    e.preventDefault();
    try {
      await api(`/plans/${p.id}/invest`, { method: 'POST', body: { amount } });
      setMsg({ ok: 'Investment started. Your countdown is running on your dashboard.' });
      setOpen(false); setAmount(''); onInvested?.();
    } catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <article className="card plan">
      <span className="plan-term">{monthsLabel(p.duration_months)}</span>
      <div><b className="rate">{p.rate_percent}%</b> <span className="muted">per year</span></div>
      <p className="muted">From {naira(p.min_amount)}</p>
      {open ? (
        <form className="stack" onSubmit={go}>
          <label>Amount (₦)<input type="number" min={p.min_amount} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></label>
          {balance !== null && <p className="muted small">Wallet balance: {naira(balance)}</p>}
          {a >= p.min_amount && <p className="preview">You get about <b>{naira(a + gain)}</b> on {end.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
          {short && <p className="error" role="alert">Your wallet balance is too low. <Link to="/wallet">Add money by transfer</Link></p>}
          <button className="btn" disabled={short}>Invest from my wallet</button>
          <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      ) : user?.role === 'investor' ? <button className="btn" onClick={() => { setOpen(true); setMsg(null); }}>Invest</button>
        : !user ? <Link className="btn" to="/login?role=investor">Register to invest</Link>
        : <p className="muted">Only investor accounts can invest.</p>}
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
      {msg?.err && <p className="error" role="alert">{msg.err}</p>}
    </article>
  );
}

export default function Plans({ user, onInvested, plans }) {
  const [balance, setBalance] = useState(null);
  const refresh = () => user?.role === 'investor' && api('/wallet').then((w) => setBalance(w.balance)).catch(() => {});
  useEffect(() => { refresh(); }, [user]);
  return (
    <div className="grid plans">
      {plans.map((p) => <PlanCard key={p.id} p={p} user={user} balance={balance} onInvested={() => { refresh(); onInvested?.(); }} />)}
    </div>
  );
}
