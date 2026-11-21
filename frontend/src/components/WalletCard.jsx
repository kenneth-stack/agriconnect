import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, naira } from '../api.js';

export const TX_LABEL = { transfer_in: 'Money added', order_payment: 'Order payment', refund: 'Refund', investment: 'Investment', investment_payout: 'Investment payout', admin_credit: 'Credit from AgriConnect', withdrawal: 'Withdrawal', withdrawal_refund: 'Withdrawal returned' };

// The wallet balance and the person's own bank account number (investors and buyers)
export function WalletCard({ w, reload, compact }) {
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  async function getAccount() {
    setMsg(null);
    try { await api('/wallet/account', { method: 'POST' }); reload(); } catch (e) { setMsg(e.message); }
  }
  const copy = () => { navigator.clipboard?.writeText(w.account.account_number); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <section className="wallet" aria-label="Wallet">
      <p>Wallet balance</p>
      <h2>{naira(w.balance)}</h2>
      {w.account ? (
        <div className="acct">
          <span>Your account number</span>
          <div className="acct-row"><b>{w.account.account_number}</b><button type="button" onClick={copy}>{copied ? 'Copied ✔' : 'Copy'}</button></div>
          <small>{w.account.bank_name} · {w.account.account_name}</small>
        </div>
      ) : w.paystackEnabled ? (
        <div className="acct">
          <span>You do not have an account number yet</span>
          <button type="button" className="acct-btn" onClick={getAccount}>Get my account number</button>
          {msg && <small role="alert">{msg}</small>}
        </div>
      ) : <div className="acct"><span>Account numbers are being set up. Please check back soon.</span></div>}
      {compact && <div className="wallet-actions"><Link to="/wallet">＋ Add money</Link><Link to="/wallet#withdraw">↗ Withdraw</Link></div>}
      <p className="wallet-hint">{compact ? <Link to="/wallet">Open wallet →</Link> : 'Transfer any amount from any bank app to your account number. It shows in your wallet once the bank confirms it, usually within a few minutes.'}</p>
    </section>
  );
}

export function WalletBox({ compact = true }) {
  const [w, setW] = useState(null);
  const load = () => api('/wallet').then(setW).catch(() => {});
  useEffect(() => { load(); }, []);
  return w ? <WalletCard w={w} reload={load} compact={compact} /> : null;
}
