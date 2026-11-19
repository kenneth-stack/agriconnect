import { query, one } from './db.js';
import { HttpError } from './http.js';
import { paystackEnabled, createDedicatedAccount } from './paystack.js';

// Moves money in (positive) or out (negative) of a wallet inside a transaction. The row is locked so two
// requests can never spend the same naira. A repeated reference is ignored, so webhook retries are safe.
export async function moveMoney(q, userId, delta, type, description, reference = null) {
  await q('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const [w] = await q('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);
  if (reference && (await q('SELECT 1 FROM wallet_transactions WHERE reference=$1', [reference])).length) return { balance: w.balance, duplicate: true };
  const next = Math.round((w.balance + delta) * 100) / 100;
  if (next < 0) throw new HttpError(400, 'Your wallet balance is too low for this. Add money by transfer and try again.');
  await q('UPDATE wallets SET balance=$1 WHERE user_id=$2', [next, userId]);
  await q('INSERT INTO wallet_transactions (user_id,type,amount,balance_after,description,reference) VALUES ($1,$2,$3,$4,$5,$6)', [userId, type, delta, next, description, reference]);
  return { balance: next };
}

// Gives an investor or buyer their own account number. Asking again returns the same one.
export async function provisionAccount(userId) {
  if (!paystackEnabled()) throw new HttpError(503, 'Account numbers are not available yet. Please check back soon.');
  const have = await one('SELECT account_number, account_name, bank_name FROM virtual_accounts WHERE user_id=$1', [userId]);
  if (have) return have;
  const u = await one('SELECT u.name, u.email, k.phone FROM users u LEFT JOIN kyc k ON k.user_id = u.id WHERE u.id=$1', [userId]);
  let a;
  try { a = await createDedicatedAccount({ email: u.email, name: u.name, phone: u.phone }); }
  catch (e) { console.error('Paystack account creation failed:', e.message); throw new HttpError(502, 'We could not create your account number right now. Please try again shortly.'); }
  if (!a.account_number) throw new HttpError(502, 'Your account number is still being prepared. Please try again in a minute.');
  await query('INSERT INTO virtual_accounts (user_id, account_number, account_name, bank_name, paystack_customer_code) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING',
    [userId, a.account_number, a.account_name, a.bank_name, a.code]);
  return one('SELECT account_number, account_name, bank_name FROM virtual_accounts WHERE user_id=$1', [userId]);
}
