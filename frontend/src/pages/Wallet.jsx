import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, naira, when } from '../api.js';
import { WalletCard, TX_LABEL } from '../components/WalletCard.jsx';

function Withdraw({ w, reload }) {
  const [bank, setBank] = useState({ bank_name: '', account_number: '', account_name: '' });
  const [amount, setAmount] = useState('');
  const [list, setList] = useState({ minimum: 1000, items: [] });
  const [msg, setMsg] = useState(null);
  const load = () => api('/withdrawals').then(setList).catch(() => {});
  useEffect(() => { load(); api('/profile').then((p) => p.payout && setBank(p.payout)).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/withdrawals', { method: 'POST', body: { amount, ...bank } }); setMsg({ ok: 'Withdrawal requested. The money has left your wallet and our team will send it to your bank.' }); setAmount(''); load(); reload(); }
    catch (er) { setMsg({ err: er.message }); }
  }
  async function cancel(id) {
    if (!window.confirm('Cancel this withdrawal and put the money back in your wallet?')) return;
    try { await api(`/withdrawals/${id}/cancel`, { method: 'POST' }); load(); reload(); } catch (er) { setMsg({ err: er.message }); }
  }

  return (
    <section id="withdraw" className="card">
      <h3>Withdraw money</h3>
      <p className="muted">Changed your mind? Take your unspent wallet money back to your bank. Money inside your investment plans is not in the wallet; it stays in the plan until it matures. Smallest withdrawal: {naira(list.minimum)}.</p>
      <form className="stack" onSubmit={submit}>
        <label>Amount (₦)<input type="number" min={list.minimum} max={w.balance} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={`Up to ${naira(w.balance)}`} /></label>
        <div className="row">
          <label className="grow">Bank<input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} required /></label>
          <label className="grow">Account number (10 digits)<input inputMode="numeric" maxLength={10} value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} required /></label>
        </div>
        <label>Account name<input value={bank.account_name} onChange={(e) => setBank({ ...bank, account_name: e.target.value })} required /></label>
        {msg?.err && <p className="error" role="alert">{msg.err}</p>}{msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
        <button className="btn" disabled={w.balance < list.minimum}>Request withdrawal</button>
        {w.balance < list.minimum && <p className="muted small">Your balance is below the smallest withdrawal.</p>}
      </form>
      {list.items.length > 0 && <>
        <h4>My withdrawals</h4>
        <div className="table-wrap"><table><tbody>{list.items.map((x) => (
          <tr key={x.id}><td>{when(x.created_at)}</td><td>{naira(x.amount)}<br /><span className="muted small">{x.bank_name} ••••{x.account_number.slice(-4)}</span></td>
            <td><span className={'badge ' + x.status}>{x.status === 'pending' ? 'waiting to be paid' : x.status}</span>{x.admin_note && <><br /><span className="muted small">{x.admin_note}</span></>}</td>
            <td>{x.status === 'pending' && <button className="ghost" onClick={() => cancel(x.id)}>Cancel</button>}</td></tr>
        ))}</tbody></table></div>
      </>}
    </section>
  );
}

export default function Wallet({ user }) {
  const [w, setW] = useState(null);
  const { hash } = useLocation();
  const load = () => api('/wallet').then(setW).catch(() => {});
  useEffect(() => { if (user) load(); }, []);
  useEffect(() => { if (w && hash === '#withdraw') document.getElementById('withdraw')?.scrollIntoView({ behavior: 'smooth' }); }, [w, hash]);
  if (!user) return <Navigate to="/login" />;
  if (!['investor', 'buyer'].includes(user.role)) return <Navigate to="/" />;
  if (!w) return <p className="muted">Loading…</p>;
  return (
    <>
      <h2>My wallet</h2>
      <div className="dash">
        <div className="stack">
          <WalletCard w={w} reload={load} />
          <p className="muted">{user.role === 'investor' ? 'Money you invest leaves your wallet and appears under My investments on your dashboard, with a countdown to its maturity date.' : 'Money you spend on produce leaves your wallet. Follow each order under History.'}</p>
          <Withdraw w={w} reload={load} />
        </div>
        <section>
          <h3>Wallet history</h3>
          {!w.transactions.length && <p className="muted">No transactions yet.</p>}
          <div className="table-wrap"><table><tbody>
            {w.transactions.map((t) => (
              <tr key={t.id}><td>{when(t.created_at)}</td><td><b>{TX_LABEL[t.type] || t.type}</b><br /><span className="muted small">{t.description}</span></td>
                <td className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount < 0 ? '−' : '+'}{naira(Math.abs(t.amount))}<br /><span className="muted small">Balance {naira(t.balance_after)}</span></td></tr>
            ))}
          </tbody></table></div>
        </section>
      </div>
    </>
  );
}
