import { Router } from 'express';
import { query, one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';
import { moveMoney } from '../wallet.js';

const r = Router();

// PLACEHOLDER rates so the screens have something to show. Set your real rates in Admin > Plans.
const DEFAULTS = [[12, 10], [18, 12], [24, 14], [36, 16], [48, 18], [60, 20]];
export async function ensurePlans() {
  if ((await one('SELECT COUNT(*)::int AS n FROM investment_plans')).n) return;
  for (const [m, rate] of DEFAULTS) await query('INSERT INTO investment_plans (duration_months, rate_percent, min_amount) VALUES ($1,$2,50000)', [m, rate]);
  console.log('Seeded placeholder investment plans. Set real rates in Admin > Plans.');
}

r.get('/plans', async (_q, res) =>
  res.json(await query('SELECT id, duration_months, rate_percent, min_amount FROM investment_plans WHERE active ORDER BY duration_months')));

// Invests from the wallet balance. The countdown starts immediately.
r.post('/plans/:id/invest', requireAuth('investor'), needKyc, async (req, res) => {
  const plan = await one('SELECT * FROM investment_plans WHERE id=$1 AND active', [Number(req.params.id) || 0]);
  if (!plan) throw new HttpError(404, 'That plan is not available.');
  const amount = Number(req.body.amount);
  if (!(amount >= plan.min_amount)) throw new HttpError(400, `The minimum for this plan is ₦${plan.min_amount.toLocaleString('en-NG')}.`);
  const expected = Math.round(amount * (plan.rate_percent / 100) * (plan.duration_months / 12) * 100) / 100;
  const inv = await tx(async (q) => {
    await moveMoney(q, req.user.id, -amount, 'investment', `Invested in the ${plan.duration_months}-month plan`);
    const [row] = await q(`INSERT INTO plan_investments (investor_id,plan_id,amount,duration_months,rate_percent,expected_return,status,start_date,maturity_date)
      VALUES ($1,$2,$3,$4,$5,$6,'active', now(), now() + ($4::int * interval '1 month')) RETURNING id, maturity_date`,
      [req.user.id, plan.id, amount, plan.duration_months, plan.rate_percent, expected]);
    await logActivity(q, req.user.id, 'investment_started', `Started a ${plan.duration_months}-month investment of ₦${amount.toLocaleString('en-NG')}`);
    return row;
  });
  res.status(201).json({ id: inv.id, maturity_date: inv.maturity_date, expected_return: expected });
});

export default r;
