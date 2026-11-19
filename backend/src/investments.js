import { HttpError } from './http.js';
import { moveMoney } from './wallet.js';

// Pays out a matured investment. mode "wallet" credits principal + return to the investor's wallet;
// mode "paid" just records that you paid them outside the app.
export async function settleInvestment(q, id, mode) {
  const [i] = await q(`UPDATE plan_investments SET status='paid' WHERE id=$1 AND status='active' AND maturity_date <= now()
    RETURNING investor_id, amount, expected_return, duration_months`, [id]);
  if (!i) throw new HttpError(400, 'This investment has not matured yet, or was already paid out.');
  if (mode === 'wallet') await moveMoney(q, i.investor_id, i.amount + i.expected_return, 'investment_payout', `Payout: ${i.duration_months}-month investment #${id}`);
  return i;
}
