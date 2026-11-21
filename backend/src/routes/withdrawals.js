import { Router } from 'express';
import { query, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';
import { moveMoney } from '../wallet.js';

const r = Router();
export const MIN_WITHDRAWAL = 1000;
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');

// Buyers and investors can take unspent wallet money back to their bank account (money inside active investment plans is not in the wallet).
r.get('/withdrawals', requireAuth('investor', 'buyer'), needKyc, async (req, res) =>
  res.json({ minimum: MIN_WITHDRAWAL, items: await query('SELECT id, amount, bank_name, account_number, account_name, status, admin_note, created_at, processed_at FROM withdrawals WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]) }));

// The money leaves the wallet straight away, so it cannot be spent twice. An admin pays it out, or it comes back (rejected / cancelled).
r.post('/withdrawals', requireAuth('investor', 'buyer'), needKyc, async (req, res) => {
  const amount = Number(req.body.amount), { bank_name, account_number, account_name } = req.body;
  if (!(amount >= MIN_WITHDRAWAL)) throw new HttpError(400, `The smallest withdrawal is ${naira(MIN_WITHDRAWAL)}.`);
  if (!bank_name?.trim() || !account_name?.trim() || !/^\d{10}$/.test(account_number || '')) throw new HttpError(400, 'Enter the bank, a 10-digit account number and the account name.');
  const id = await tx(async (q) => {
    const [w] = await q('INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user.id, amount, bank_name.trim(), account_number, account_name.trim()]);
    await moveMoney(q, req.user.id, -amount, 'withdrawal', `Withdrawal request #${w.id} to ${bank_name.trim()}`); // refuses if the balance is too low
    await q(`INSERT INTO payout_accounts (user_id, bank_name, account_number, account_name) VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id) DO UPDATE SET bank_name=$2, account_number=$3, account_name=$4`, [req.user.id, bank_name.trim(), account_number, account_name.trim()]);
    await logActivity(q, req.user.id, 'withdrawal_requested', `Requested a withdrawal of ${naira(amount)}`);
    return w.id;
  });
  res.status(201).json({ id });
});

r.post('/withdrawals/:id/cancel', requireAuth('investor', 'buyer'), async (req, res) => {
  await tx(async (q) => {
    const [w] = await q("SELECT * FROM withdrawals WHERE id=$1 AND user_id=$2 AND status='pending' FOR UPDATE", [Number(req.params.id) || 0, req.user.id]);
    if (!w) throw new HttpError(400, 'Only a pending withdrawal can be cancelled.');
    await q("UPDATE withdrawals SET status='cancelled', processed_at=now() WHERE id=$1", [w.id]);
    await moveMoney(q, req.user.id, w.amount, 'withdrawal_refund', `Withdrawal #${w.id} cancelled`, `wd-refund:${w.id}`);
    await logActivity(q, req.user.id, 'withdrawal_cancelled', `Cancelled the withdrawal of ${naira(w.amount)}`);
  });
  res.json({ ok: true });
});

export default r;
