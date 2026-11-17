import { Router } from 'express';
import { query, one, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';

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

// Creates a pending investment; the countdown starts when an admin confirms the money was received.
r.post('/plans/:id/invest', requireAuth('investor'), needKyc, async (req, res) => {
  // Off until a payment provider (Stripe) is connected. Set PAYMENTS_ENABLED=true to allow manual bank-transfer investments.
  if (process.env.PAYMENTS_ENABLED !== 'true') throw new HttpError(503, 'Investment payments are coming soon.');
  const plan = await one('SELECT * FROM investment_plans WHERE id=$1 AND active', [Number(req.params.id) || 0]);
  if (!plan) throw new HttpError(404, 'That plan is not available.');
  const amount = Number(req.body.amount);
  if (!(amount >= plan.min_amount)) throw new HttpError(400, `The minimum for this plan is ₦${plan.min_amount.toLocaleString('en-NG')}.`);
  const expected = Math.round(amount * (plan.rate_percent / 100) * (plan.duration_months / 12) * 100) / 100;
  const row = await one(`INSERT INTO plan_investments (investor_id,plan_id,amount,duration_months,rate_percent,expected_return)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [req.user.id, plan.id, amount, plan.duration_months, plan.rate_percent, expected]);
  await logActivity(query, req.user.id, 'investment_created', `Started a ${plan.duration_months}-month investment of ₦${amount.toLocaleString('en-NG')} (awaiting payment confirmation)`);
  res.status(201).json({ id: row.id, expected_return: expected });
});

export default r;
