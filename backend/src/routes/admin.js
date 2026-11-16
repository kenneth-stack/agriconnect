import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, one, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError } from '../http.js';
import { STATES } from '../meta.js';

const r = Router();
r.use('/admin', requireAuth('admin'));

r.get('/admin/overview', async (_q, res) => {
  const [users, orders, totals] = await Promise.all([
    query('SELECT role, COUNT(*)::int AS n FROM users GROUP BY role'),
    query('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status'),
    one(`SELECT (SELECT COUNT(*)::int FROM listings WHERE status='available') AS listings,
                (SELECT COUNT(*)::int FROM equipment WHERE active) AS equipment,
                (SELECT COALESCE(SUM(amount),0)::float8 FROM investments) AS invested,
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
    if (e.code === '23505') throw new HttpError(409, 'That email is already registered.');
    throw e;
  }
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

export default r;
