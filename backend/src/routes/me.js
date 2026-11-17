import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();

// Everything the signed-in person has done
r.get('/me/history', requireAuth(), async (req, res) => {
  const uid = req.user.id;
  const [activity, orders, investments, assistance, bookings] = await Promise.all([
    query('SELECT id, action, detail, created_at FROM activity WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [uid]),
    query(`SELECT o.id, o.quantity, o.total, o.status, o.delivery_state, o.note, o.created_at, o.updated_at,
        l.title, l.unit, b.name AS buyer, f.name AS farmer,
        CASE WHEN o.buyer_id = $1 THEN 'buying' ELSE 'selling' END AS side
      FROM orders o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id JOIN users f ON f.id = o.farmer_id
      WHERE o.buyer_id = $1 OR o.farmer_id = $1 ORDER BY o.id DESC`, [uid]),
    query(`SELECT id, amount, duration_months, rate_percent, expected_return, status, start_date, maturity_date, created_at,
        CASE WHEN status = 'active' AND maturity_date <= now() THEN 'matured' ELSE status END AS display_status
      FROM plan_investments WHERE investor_id = $1 ORDER BY id DESC`, [uid]),
    query('SELECT id, item, quantity, unit, description, status, admin_note, created_at FROM assistance_requests WHERE farmer_id=$1 ORDER BY id DESC', [uid]),
    query(`SELECT b.id, b.start_date::text AS start_date, b.end_date::text AS end_date, b.total, b.status, e.name
      FROM bookings b JOIN equipment e ON e.id = b.equipment_id WHERE b.user_id = $1 ORDER BY b.id DESC`, [uid])
  ]);
  res.json({ activity, orders, investments, assistance, bookings });
});

export default r;
