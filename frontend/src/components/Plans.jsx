import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, naira, useMeta, when } from '../api.js';

export const monthsLabel = (m) => `${m} months` + (m % 12 === 0 ? ` (${m / 12} year${m > 12 ? 's' : ''})` : '');

function PlanCard({ p, user, onInvested }) {
  const { paymentNote, paymentsEnabled } = useMeta();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState(null);
  const a = Number(amount) || 0;
  const gain = a * (p.rate_percent / 100) * (p.duration_months / 12);
  const end = new Date(); end.setMonth(end.getMonth() + p.duration_months);

  async function go(e) {
    e.preventDefault();
    try {
      await api(`/plans/${p.id}/invest`, { method: 'POST', body: { amount } });
      setMsg({ ok: `Investment created. ${paymentNote} Your countdown starts once we confirm your payment.` });
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
          {a >= p.min_amount && <p className="preview">You get about <b>{naira(a + gain)}</b> on {end.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
          {paymentsEnabled
            ? <button className="btn">Confirm investment</button>
            : <><p className="notice">Online payment is coming soon. Use this calculator to see what you could earn. We will let you know when you can invest.</p>
                <button type="button" className="btn" disabled>Payment coming soon</button></>}
          <button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button>
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
  const { paymentsEnabled } = useMeta();
  return (
    <>
      {!paymentsEnabled && <p className="notice">💳 Payments are coming soon. You can already explore the plans and see your expected returns.</p>}
      <div className="grid plans">{plans.map((p) => <PlanCard key={p.id} p={p} user={user} onInvested={onInvested} />)}</div>
    </>
  );
}
