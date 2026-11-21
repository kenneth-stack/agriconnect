import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, one, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { purgeImages, sendIdCard } from '../upload.js';
import { HttpError } from '../http.js';
import { decrypt } from '../secure.js';
import { tx } from '../db.js';
import { settleInvestment } from '../investments.js';
import { moveMoney } from '../wallet.js';
import { getFees } from '../settings.js';
import { STATES } from '../meta.js';

const r = Router();
r.use('/admin', requireAuth('admin'));

r.get('/admin/overview', async (_q, res) => {
  const [users, orders, totals] = await Promise.all([
    query('SELECT role, COUNT(*)::int AS n FROM users GROUP BY role'),
    query('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status'),
    one(`SELECT (SELECT COUNT(*)::int FROM listings WHERE status='available') AS listings,
                (SELECT COUNT(*)::int FROM equipment WHERE active) AS equipment,
                (SELECT COALESCE(SUM(amount),0)::float8 FROM plan_investments WHERE status IN ('active','paid')) AS invested,
                (SELECT COALESCE(SUM(total),0)::float8 FROM orders WHERE status='completed') AS traded,
                (SELECT COUNT(*)::int FROM kyc WHERE status='submitted') AS pending_kyc,
                (SELECT COUNT(*)::int FROM assistance_requests WHERE status='pending') AS pending_assistance,
                (SELECT COUNT(*)::int FROM withdrawals WHERE status='pending') AS pending_withdrawals,
                (SELECT COUNT(*)::int FROM orders WHERE payout_status='pending') AS pending_payouts,
                (SELECT COUNT(*)::int FROM bookings WHERE status='pending') AS pending_bookings`)
  ]);
  res.json({ users, orders, ...totals });
});

r.get('/admin/users', async (_q, res) =>
  res.json(await query('SELECT id, name, email, phone, role, state, created_at FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 500')));

// Register a farmer on their behalf (e.g. a farmer without a smartphone)
r.post('/admin/farmers', async (req, res) => {
  const { name, email, password, phone, state } = req.body;
  if (!name || !email || !(password?.length >= 8) || !STATES.includes(state)) throw new HttpError(400, 'Name, email, state and a password of 8+ characters are required.');
  try {
    const u = await one("INSERT INTO users (name,email,password_hash,role,phone,state) VALUES ($1,$2,$3,'farmer',$4,$5) RETURNING id",
      [name, email.toLowerCase(), bcrypt.hashSync(password, 10), phone || null, state]);
    await logActivity(query, u.id, 'registered', 'Registered by an AgriConnect admin');
    res.status(201).json({ id: u.id });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Email already exists.');
    throw e;
  }
});

r.get('/admin/admins', async (_q, res) =>
  res.json(await query("SELECT id, name, email, created_at FROM users WHERE role='admin' ORDER BY id")));

r.post('/admin/admins', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email || !(password?.length >= 8)) throw new HttpError(400, 'Name, email and a password of 8+ characters are required.');
  try {
    const u = await one("INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin') RETURNING id",
      [name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10)]);
    await logActivity(query, u.id, 'registered', 'Added as an admin');
    await logActivity(query, req.user.id, 'added_admin', `Added ${email.toLowerCase()} as an admin`);
    res.status(201).json({ id: u.id });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Email already exists. Use a different email for the new admin.');
    throw e;
  }
});

// Removes admin access (the person becomes a normal buyer account)
r.delete('/admin/admins/:id', async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.user.id) throw new HttpError(400, 'You cannot remove your own admin access.');
  const u = await one("UPDATE users SET role='buyer' WHERE id=$1 AND role='admin' RETURNING email", [id]);
  if (!u) throw new HttpError(404, 'Admin not found.');
  await logActivity(query, req.user.id, 'removed_admin', `Removed admin access for ${u.email}`);
  res.json({ ok: true });
});

r.get('/admin/activity', async (_q, res) =>
  res.json(await query('SELECT a.id, a.action, a.detail, a.created_at, u.name, u.role FROM activity a JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200')));

r.get('/admin/orders', async (_q, res) =>
  res.json(await query(`SELECT o.id, o.quantity, o.total, o.delivery_fee, o.payment_method, o.payment_status, o.status, o.created_at, l.title, l.unit, b.name AS buyer, f.name AS farmer
    FROM orders o JOIN listings l ON l.id=o.listing_id JOIN users b ON b.id=o.buyer_id JOIN users f ON f.id=o.farmer_id ORDER BY o.id DESC LIMIT 200`)));

r.get('/admin/bookings', async (_q, res) =>
  res.json(await query(`SELECT b.id, b.start_date::text AS start_date, b.end_date::text AS end_date, b.total, b.status, e.name AS equipment, u.name AS person
    FROM bookings b JOIN equipment e ON e.id=b.equipment_id JOIN users u ON u.id=b.user_id ORDER BY b.id DESC LIMIT 200`)));

r.patch('/admin/bookings/:id', async (req, res) => {
  if (!['confirmed', 'cancelled'].includes(req.body.status)) throw new HttpError(400, 'Invalid status.');
  const b = await one('UPDATE bookings SET status=$1 WHERE id=$2 RETURNING user_id', [req.body.status, Number(req.params.id) || 0]);
  if (!b) throw new HttpError(404, 'Booking not found.');
  await logActivity(query, b.user_id, `booking_${req.body.status}`, `Equipment booking #${req.params.id} ${req.body.status}`);
  res.json({ ok: true });
});

/* KYC review */
r.get('/admin/kyc', async (_q, res) =>
  res.json(await query(`SELECT k.user_id, u.name, u.email, u.role, k.state, k.id_type, k.id_last4, k.bvn_last4, k.status, k.review_note, k.submitted_at
    FROM kyc k JOIN users u ON u.id = k.user_id ORDER BY (k.status = 'submitted') DESC, k.submitted_at DESC LIMIT 300`)));

// Full BVN / ID number, for checking with your verification provider. Every view is logged.
r.get('/admin/kyc/:userId/reveal', async (req, res) => {
  const id = Number(req.params.userId) || 0;
  const k = await one('SELECT bvn_enc, id_number_enc, address, phone FROM kyc WHERE user_id=$1', [id]);
  if (!k) throw new HttpError(404, 'No KYC profile.');
  const farms = await query('SELECT name, address, state, lga, size_ha, main_crops, latitude, longitude FROM farms WHERE user_id=$1 ORDER BY id', [id]);
  await logActivity(query, req.user.id, 'viewed_kyc', `Viewed full KYC details of user #${id}`);
  res.json({ bvn: decrypt(k.bvn_enc), id_number: decrypt(k.id_number_enc), address: k.address, phone: k.phone, farms });
});

r.get('/admin/kyc/:userId/id-card', async (req, res) => {
  await logActivity(query, req.user.id, 'viewed_kyc', `Viewed the ID card of user #${Number(req.params.userId) || 0}`);
  await sendIdCard(res, Number(req.params.userId) || 0);
});

r.patch('/admin/kyc/:userId', async (req, res) => {
  const { status, note } = req.body;
  if (!['verified', 'rejected'].includes(status)) throw new HttpError(400, 'Invalid status.');
  const k = await one('UPDATE kyc SET status=$1, review_note=$2, reviewed_at=now() WHERE user_id=$3 RETURNING user_id', [status, note || null, Number(req.params.userId) || 0]);
  if (!k) throw new HttpError(404, 'No KYC profile.');
  await logActivity(query, k.user_id, `kyc_${status}`, status === 'verified' ? 'KYC profile verified' : `KYC profile rejected${note ? ': ' + note : ''}`);
  res.json({ ok: true });
});

/* Assistance / funding applications */
r.get('/admin/assistance', async (_q, res) =>
  res.json(await query(`SELECT a.id, a.item, a.quantity, a.unit, a.description, a.status, a.admin_note, a.created_at, u.name AS farmer, u.state, u.phone
    FROM assistance_requests a JOIN users u ON u.id = a.farmer_id ORDER BY (a.status = 'pending') DESC, a.id DESC LIMIT 300`)));

r.patch('/admin/assistance/:id', async (req, res) => {
  const { status, note } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'Choose approve or reject.');
  const a = await one(`UPDATE assistance_requests SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=now()
    WHERE id=$4 AND status='pending' RETURNING farmer_id, item`, [status, note || null, req.user.id, Number(req.params.id) || 0]);
  if (!a) throw new HttpError(400, 'This application was already decided, or does not exist.');
  await logActivity(query, a.farmer_id, `assistance_${status}`, `Your request for ${a.item} was ${status}${note ? ': ' + note : ''}`);
  res.json({ ok: true });
});

/* Investment plans and subscriptions */
r.get('/admin/plans', async (_q, res) => res.json(await query('SELECT * FROM investment_plans ORDER BY duration_months')));

r.post('/admin/plans', async (req, res) => {
  const m = Number(req.body.duration_months), rate = Number(req.body.rate_percent), min = Number(req.body.min_amount);
  if (!(Number.isInteger(m) && m >= 1 && m <= 120) || !(rate >= 0 && rate <= 100) || !(min > 0)) throw new HttpError(400, 'Enter months (1-120), a yearly rate (0-100) and a minimum amount.');
  try { res.status(201).json(await one('INSERT INTO investment_plans (duration_months,rate_percent,min_amount) VALUES ($1,$2,$3) RETURNING id', [m, rate, min])); }
  catch (e) { if (e.code === '23505') throw new HttpError(409, 'A plan with that duration already exists.'); throw e; }
});

// Changing a rate never affects investments already made (they keep their own rate).
r.patch('/admin/plans/:id', async (req, res) => {
  const { rate_percent, min_amount, active } = req.body;
  await query('UPDATE investment_plans SET rate_percent=COALESCE($1,rate_percent), min_amount=COALESCE($2,min_amount), active=COALESCE($3,active) WHERE id=$4',
    [rate_percent ?? null, min_amount ?? null, active ?? null, Number(req.params.id) || 0]);
  res.json({ ok: true });
});

r.get('/admin/investments', async (_q, res) =>
  res.json(await query(`SELECT i.id, i.amount, i.duration_months, i.rate_percent, i.expected_return, i.status, i.start_date, i.maturity_date, i.created_at, u.name AS investor,
      CASE WHEN i.status = 'active' AND i.maturity_date <= now() THEN 'matured' ELSE i.status END AS display_status
    FROM plan_investments i JOIN users u ON u.id = i.investor_id ORDER BY (i.status = 'pending') DESC, i.id DESC LIMIT 300`)));

// After a plan matures: pay the investor into their wallet, or mark it paid if you paid them outside the app.
r.patch('/admin/investments/:id', async (req, res) => {
  if (!['wallet', 'paid'].includes(req.body.action)) throw new HttpError(400, 'Invalid action.');
  await tx(async (q) => {
    const i = await settleInvestment(q, Number(req.params.id) || 0, req.body.action);
    await logActivity(q, i.investor_id, 'investment_paid', `Your ${i.duration_months}-month investment was paid out${req.body.action === 'wallet' ? ' to your wallet' : ''}`);
  });
  res.json({ ok: true });
});

/* Farmer payouts for prepaid orders */
r.get('/admin/payouts', async (_q, res) =>
  res.json(await query(`SELECT o.id, COALESCE(o.items_total, o.total) AS amount, o.payout_status, o.updated_at, l.title, f.name AS farmer, f.phone,
      p.bank_name, p.account_number, p.account_name
    FROM orders o JOIN listings l ON l.id = o.listing_id JOIN users f ON f.id = o.farmer_id LEFT JOIN payout_accounts p ON p.user_id = f.id
    WHERE o.payment_status = 'released' ORDER BY (o.payout_status = 'pending') DESC, o.id DESC LIMIT 300`)));

r.patch('/admin/payouts/:id', async (req, res) => {
  const o = await one("UPDATE orders SET payout_status='paid' WHERE id=$1 AND payout_status='pending' RETURNING farmer_id, COALESCE(items_total, total) AS amount", [Number(req.params.id) || 0]);
  if (!o) throw new HttpError(400, 'Nothing to pay out for this order.');
  await logActivity(query, o.farmer_id, 'payout_sent', `Payout of ₦${o.amount.toLocaleString('en-NG')} for order #${req.params.id} was sent`);
  res.json({ ok: true });
});

/* Delivery fees */
r.get('/admin/fees', async (_q, res) => res.json(await getFees()));
r.put('/admin/fees', async (req, res) => {
  const same = Number(req.body.same), other = Number(req.body.other);
  if (!(same >= 0) || !(other >= 0)) throw new HttpError(400, 'Enter both delivery fees.');
  for (const [k, v] of [['delivery_same_state', same], ['delivery_other_state', other]])
    await query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, String(v)]);
  res.json({ ok: true });
});

/* Wallets */
r.post('/admin/wallet/credit', async (req, res) => {
  const amount = Number(req.body.amount);
  if (!(amount > 0)) throw new HttpError(400, 'Enter an amount above zero.');
  const u = await one("SELECT id, name FROM users WHERE id=$1 AND role IN ('investor','buyer')", [Number(req.body.user_id) || 0]);
  if (!u) throw new HttpError(404, 'Choose an investor or buyer.');
  await tx(async (q) => {
    await moveMoney(q, u.id, amount, 'admin_credit', req.body.note?.trim() || 'Credited by admin');
    await logActivity(q, u.id, 'wallet_credit', `Wallet credited with ₦${amount.toLocaleString('en-NG')} by AgriConnect`);
    await logActivity(q, req.user.id, 'wallet_credit_given', `Credited ₦${amount.toLocaleString('en-NG')} to ${u.name}`);
  });
  res.json({ ok: true });
});
r.get('/admin/wallet/transactions', async (_q, res) =>
  res.json(await query(`SELECT t.id, t.type, t.amount, t.balance_after, t.description, t.created_at, u.name, u.role
    FROM wallet_transactions t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 200`)));

// Help someone who cannot reset by email: set a temporary password (not for other admins)
r.patch('/admin/users/:id/password', async (req, res) => {
  if (!(req.body.password?.length >= 8)) throw new HttpError(400, 'Use a password of 8+ characters.');
  const u = await one("UPDATE users SET password_hash=$1 WHERE id=$2 AND role <> 'admin' RETURNING email", [bcrypt.hashSync(req.body.password, 10), Number(req.params.id) || 0]);
  if (!u) throw new HttpError(404, 'User not found.');
  await logActivity(query, req.user.id, 'set_password', `Set a temporary password for ${u.email}`);
  res.json({ ok: true });
});

// Deletes an account: personal data, photos, KYC, farms and payout details are erased. The account itself is anonymised
// (not removed) so trade and wallet records of other people stay consistent.
r.delete('/admin/users/:id', async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
  const u = await one('SELECT id, name, email, role FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.role === 'admin') throw new HttpError(400, 'Remove their admin access first (Admins tab), then delete the account.');
  const bal = (await one('SELECT balance FROM wallets WHERE user_id=$1', [id]))?.balance || 0;
  if (bal > 0.009) throw new HttpError(400, `This user still has ₦${bal.toLocaleString('en-NG')} in their wallet. Settle it first (Wallets).`);
  const open = await one(`SELECT (SELECT COUNT(*)::int FROM orders WHERE (buyer_id=$1 OR farmer_id=$1) AND status IN ('pending','confirmed')) AS orders,
    (SELECT COUNT(*)::int FROM orders WHERE farmer_id=$1 AND payout_status='pending') AS payouts,
    (SELECT COUNT(*)::int FROM plan_investments WHERE investor_id=$1 AND status IN ('pending','active')) AS investments,
    (SELECT COUNT(*)::int FROM withdrawals WHERE user_id=$1 AND status='pending') AS withdrawals`, [id]);
  if (open.withdrawals) throw new HttpError(400, 'This user has a withdrawal waiting to be paid. Process it first (Withdrawals).');
  if (open.orders || open.investments) throw new HttpError(400, 'This user has open orders or active investments. Finish or cancel them first.');
  if (open.payouts) throw new HttpError(400, 'This farmer is still owed a payout. Pay it first (Payouts).');
  await tx(async (q) => {
    await purgeImages(q, 'owner_id=$1', [id]);
    for (const t of ['kyc', 'farms', 'farmer_profiles', 'password_resets', 'payout_accounts', 'virtual_accounts']) await q(`DELETE FROM ${t} WHERE user_id=$1`, [id]);
    await q("UPDATE listings SET status='removed' WHERE seller_id=$1", [id]);
    await q("UPDATE users SET name='Deleted user', email=$1, password_hash='!', phone=NULL, state=NULL, deleted_at=now() WHERE id=$2", [`deleted-${id}@deleted.invalid`, id]);
    await logActivity(q, req.user.id, 'deleted_user', `Deleted the account of ${u.name} (${u.email})`);
  });
  res.json({ ok: true });
});

/* Withdrawals: buyers and investors taking unspent wallet money back to their bank */
r.get('/admin/withdrawals', async (_q, res) =>
  res.json(await query(`SELECT w.id, w.amount, w.bank_name, w.account_number, w.account_name, w.status, w.admin_note, w.created_at, w.processed_at, u.name, u.role, u.phone
    FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY (w.status = 'pending') DESC, w.id DESC LIMIT 300`)));

// paid: you sent the money to their bank yourself. reject: the money goes back into their wallet.
r.patch('/admin/withdrawals/:id', async (req, res) => {
  const { action, note } = req.body;
  if (!['paid', 'reject'].includes(action)) throw new HttpError(400, 'Choose paid or reject.');
  await tx(async (q) => {
    const [w] = await q("SELECT * FROM withdrawals WHERE id=$1 AND status='pending' FOR UPDATE", [Number(req.params.id) || 0]);
    if (!w) throw new HttpError(400, 'This withdrawal was already processed, or does not exist.');
    if (action === 'reject') await moveMoney(q, w.user_id, w.amount, 'withdrawal_refund', `Withdrawal #${w.id} rejected${note ? ': ' + note : ''}`, `wd-refund:${w.id}`);
    await q('UPDATE withdrawals SET status=$1, admin_note=$2, processed_at=now() WHERE id=$3', [action === 'paid' ? 'paid' : 'rejected', note || null, w.id]);
    await logActivity(q, w.user_id, action === 'paid' ? 'withdrawal_paid' : 'withdrawal_rejected',
      action === 'paid' ? `Your withdrawal of ₦${w.amount.toLocaleString('en-NG')} was sent to ${w.bank_name} ${w.account_number}` : `Your withdrawal of ₦${w.amount.toLocaleString('en-NG')} was rejected and returned to your wallet${note ? ': ' + note : ''}`);
  });
  res.json({ ok: true });
});

export default r;
