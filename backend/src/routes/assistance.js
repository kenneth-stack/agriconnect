import { Router } from 'express';
import { query, one, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';
import { ASSISTANCE_ITEMS, ASSISTANCE_UNITS } from '../meta.js';

const r = Router();

r.get('/assistance/mine', requireAuth('farmer'), async (req, res) =>
  res.json(await query('SELECT id, item, quantity, unit, description, status, admin_note, created_at FROM assistance_requests WHERE farmer_id=$1 ORDER BY id DESC', [req.user.id])));

r.post('/assistance', requireAuth('farmer'), needKyc, async (req, res) => {
  const { item, unit, description } = req.body, quantity = Number(req.body.quantity);
  if (!ASSISTANCE_ITEMS.includes(item)) throw new HttpError(400, 'Choose what you need.');
  if (!(quantity > 0)) throw new HttpError(400, 'Enter the quantity you need.');
  if (!ASSISTANCE_UNITS.includes(unit)) throw new HttpError(400, 'Choose a unit.');
  const row = await one('INSERT INTO assistance_requests (farmer_id,item,quantity,unit,description) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.user.id, item, quantity, unit, (description || '').trim() || null]);
  await logActivity(query, req.user.id, 'assistance_requested', `Requested ${quantity} ${unit} of ${item}`);
  res.status(201).json({ id: row.id });
});

export default r;
