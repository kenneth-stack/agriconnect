import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, one, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError } from '../http.js';
import { decrypt } from '../secure.js';
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
                (SELECT COALESCE(SUM(total),0)::float8 FROM orders WHERE status='completed') AS traded`)
  ]);
  res.json({ users, orders, ...totals });
});

r.get('/admin/users', async (_q, res) =>
  res.json(await query('SELECT id, name, email, phone, role, state, created_at FROM users ORDER BY id DESC LIMIT 500')));

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
  res.json(await query(`SELECT o.id, o.quantity, o.total, o.status, o.created_at, l.title, l.unit, b.name AS buyer, f.name AS farmer
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
  const k = await one('SELECT bvn_enc, id_number_enc FROM kyc WHERE user_id=$1', [Number(req.params.userId) || 0]);
  if (!k) throw new HttpError(404, 'No KYC profile.');
  await logActivity(query, req.user.id, 'viewed_kyc', `Viewed full KYC details of user #${req.params.userId}`);
  res.json({ bvn: decrypt(k.bvn_enc), id_number: decrypt(k.id_number_enc) });
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

const INV_ACTIONS = {
  confirm: ["status='active', start_date=now(), maturity_date=now() + (duration_months * interval '1 month')", 'pending', 'confirmed: your countdown has started'],
  cancel: ["status='cancelled'", 'pending', 'cancelled'],
  paid: ["status='paid'", 'active', 'paid out']
};
r.patch('/admin/investments/:id', async (req, res) => {
  const a = INV_ACTIONS[req.body.action];
  if (!a) throw new HttpError(400, 'Invalid action.');
  const i = await one(`UPDATE plan_investments SET ${a[0]} WHERE id=$1 AND status=$2 RETURNING investor_id, amount, duration_months`, [Number(req.params.id) || 0, a[1]]);
  if (!i) throw new HttpError(400, 'That change is not allowed for this investment.');
  await logActivity(query, i.investor_id, `investment_${req.body.action}`, `Your ₦${i.amount.toLocaleString('en-NG')} ${i.duration_months}-month investment was ${a[2]}`);
  res.json({ ok: true });
});

// Help someone who cannot reset by email: set a temporary password (not for other admins)
r.patch('/admin/users/:id/password', async (req, res) => {
  if (!(req.body.password?.length >= 8)) throw new HttpError(400, 'Use a password of 8+ characters.');
  const u = await one("UPDATE users SET password_hash=$1 WHERE id=$2 AND role <> 'admin' RETURNING email", [bcrypt.hashSync(req.body.password, 10), Number(req.params.id) || 0]);
  if (!u) throw new HttpError(404, 'User not found.');
  await logActivity(query, req.user.id, 'set_password', `Set a temporary password for ${u.email}`);
  res.json({ ok: true });
});

export default r;
