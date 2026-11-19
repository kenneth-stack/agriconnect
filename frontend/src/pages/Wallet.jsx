import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, naira, when } from '../api.js';
import { WalletCard, TX_LABEL } from '../components/WalletCard.jsx';

export default function Wallet({ user }) {
  const [w, setW] = useState(null);
  const load = () => api('/wallet').then(setW).catch(() => {});
  useEffect(() => { if (user) load(); }, []);
  if (!user) return <Navigate to="/login" />;
  if (!['investor', 'buyer'].includes(user.role)) return <Navigate to="/" />;
  if (!w) return <p className="muted">Loading…</p>;
  return (
    <>
      <h2>My wallet</h2>
      <WalletCard w={w} reload={load} />
      <p className="muted">Use your wallet to {user.role === 'investor' ? 'start investments' : 'pay for orders'}. Money you add is never spent without your say-so.</p>
      <h3>Wallet history</h3>
      {!w.transactions.length && <p className="muted">No transactions yet.</p>}
      <div className="table-wrap"><table><tbody>
        {w.transactions.map((t) => (
          <tr key={t.id}><td>{when(t.created_at)}</td><td><b>{TX_LABEL[t.type] || t.type}</b><br /><span className="muted small">{t.description}</span></td>
            <td className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount < 0 ? '−' : '+'}{naira(Math.abs(t.amount))}</td><td className="muted">Balance {naira(t.balance_after)}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
