import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();

// Everything the signed-in person has done: trades, investments, bookings, activity
r.get('/me/history', requireAuth(), async (req, res) => {
  const uid = req.user.id;
  const [activity, orders, investments, projects, bookings] = await Promise.all([
    query('SELECT id, action, detail, created_at FROM activity WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [uid]),
    query(`SELECT o.id, o.quantity, o.total, o.status, o.delivery_state, o.note, o.created_at, o.updated_at,
        l.title, l.unit, b.name AS buyer, f.name AS farmer,
        CASE WHEN o.buyer_id = $1 THEN 'buying' ELSE 'selling' END AS side
      FROM orders o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id JOIN users f ON f.id = o.farmer_id
      WHERE o.buyer_id = $1 OR o.farmer_id = $1 ORDER BY o.id DESC`, [uid]),
    query(`SELECT i.id, i.amount, i.created_at, p.title, p.status, u.name AS farmer
      FROM investments i JOIN projects p ON p.id = i.project_id JOIN users u ON u.id = p.farmer_id
      WHERE i.investor_id = $1 ORDER BY i.id DESC`, [uid]),
    query('SELECT id, title, amount_needed, amount_funded, status, created_at FROM projects WHERE farmer_id=$1 ORDER BY id DESC', [uid]),
    query(`SELECT b.id, b.start_date::text AS start_date, b.end_date::text AS end_date, b.total, b.status, e.name
      FROM bookings b JOIN equipment e ON e.id = b.equipment_id WHERE b.user_id = $1 ORDER BY b.id DESC`, [uid])
  ]);
  res.json({ activity, orders, investments, projects, bookings });
});

export default r;
