import { Router } from 'express';
import { query, one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { paystackEnabled, verifySignature } from '../paystack.js';
import { moveMoney, provisionAccount } from '../wallet.js';
import { sendWalletFunded } from '../mailer.js';

const r = Router();

// Investors and buyers have a wallet and a personal account number. (Farmers are paid out by an admin; see Admin > Payouts.)
r.get('/wallet', requireAuth('investor', 'buyer'), needKyc, async (req, res) => {
  const w = await one('SELECT balance FROM wallets WHERE user_id=$1', [req.user.id]);
  const account = await one('SELECT account_number, account_name, bank_name FROM virtual_accounts WHERE user_id=$1', [req.user.id]);
  const transactions = await query('SELECT id, type, amount, balance_after, description, created_at FROM wallet_transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]);
  res.json({ balance: w?.balance || 0, account: account || null, paystackEnabled: paystackEnabled(), transactions });
});

r.post('/wallet/account', requireAuth('investor', 'buyer'), needKyc, async (req, res) => res.json({ account: await provisionAccount(req.user.id) }));

// Paystack calls this when money arrives in someone's account number.
// Set it in your Paystack dashboard (Settings > API Keys & Webhooks): https://YOUR-API/api/paystack/webhook
r.post('/paystack/webhook', async (req, res) => {
  if (!paystackEnabled() || !verifySignature(req.rawBody, req.headers['x-paystack-signature'])) return res.sendStatus(401);
  const { event, data } = req.body;
  if (event === 'charge.success' && data?.status === 'success' && data.channel === 'dedicated_nuban') { // bank transfers only
    const acct = data.authorization?.receiver_bank_account_number, code = data.customer?.customer_code;
    let w = acct && await one('SELECT user_id FROM virtual_accounts WHERE account_number=$1', [acct]);
    if (!w && code) w = await one('SELECT user_id FROM virtual_accounts WHERE paystack_customer_code=$1', [code]);
    if (!w) console.log('Paystack payment with no matching account (check Paystack dashboard):', data.reference, data.amount / 100);
    else {
      const amount = data.amount / 100;
      let balance = null;
      await tx(async (q) => {
        const m = await moveMoney(q, w.user_id, amount, 'transfer_in', 'Bank transfer received', `ps:${data.reference}`);
        if (!m.duplicate) { balance = m.balance; await logActivity(q, w.user_id, 'wallet_funded', `Wallet funded with ₦${amount.toLocaleString('en-NG')}`); }
      });
      if (balance !== null) { // email only the first time this transfer is seen
        const u = await one('SELECT name, email FROM users WHERE id=$1', [w.user_id]);
        sendWalletFunded({ ...u, amount, balance, byTransfer: true }).catch(() => {});
      }
    }
  }
  res.sendStatus(200);
});

export default r;
