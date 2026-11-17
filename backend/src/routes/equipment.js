import { Router } from 'express';
import { query, one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { upload, saveImages } from '../upload.js';
import { HttpError } from '../http.js';
import { EQUIPMENT_TYPES } from '../meta.js';

const r = Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

r.get('/equipment', async (req, res) => {
  res.json(await query(`SELECT e.id, e.name, e.type, e.description, e.state, e.price_per_day,
      (SELECT id FROM images i WHERE i.equipment_id = e.id ORDER BY i.id LIMIT 1) AS image_id
    FROM equipment e WHERE e.active AND ($1::text IS NULL OR e.type = $1) ORDER BY e.created_at DESC`, [req.query.type || null]));
});

// Only admins add equipment for hire
r.post('/equipment', requireAuth('admin'), upload.array('images', 3), async (req, res) => {
  const { name, type, description, state } = req.body;
  const price = Number(req.body.price_per_day);
  if (!name?.trim() || !EQUIPMENT_TYPES.includes(type) || !(price > 0)) throw new HttpError(400, 'Name, type and a daily price are required.');
  const id = await tx(async (q) => {
    const [row] = await q('INSERT INTO equipment (name,type,description,state,price_per_day,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [name.trim(), type, description || null, state || null, price, req.user.id]);
    await saveImages(q, req.files, { owner_id: req.user.id, kind: 'equipment', equipment_id: row.id });
    await logActivity(q, req.user.id, 'added_equipment', `Added equipment: ${name.trim()}`);
    return row.id;
  });
  res.status(201).json({ id });
});

r.delete('/equipment/:id', requireAuth('admin'), async (req, res) => {
  await query('UPDATE equipment SET active=false WHERE id=$1', [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

r.post('/equipment/:id/book', requireAuth('farmer', 'buyer'), needKyc, async (req, res) => {
  const { start_date, end_date } = req.body;
  if (!DATE.test(start_date || '') || !DATE.test(end_date || '') || end_date < start_date) throw new HttpError(400, 'Choose valid start and end dates.');
  if (start_date < new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'Start date cannot be in the past.');
  const id = await tx(async (q) => {
    const [e] = await q('SELECT * FROM equipment WHERE id=$1 AND active FOR UPDATE', [Number(req.params.id) || 0]);
    if (!e) throw new HttpError(404, 'Equipment not found.');
    const clash = await q(`SELECT 1 FROM bookings WHERE equipment_id=$1 AND status <> 'cancelled'
      AND start_date <= $3::date AND end_date >= $2::date`, [e.id, start_date, end_date]);
    if (clash.length) throw new HttpError(409, 'That equipment is already booked on those dates.');
    const days = Math.round((Date.parse(end_date) - Date.parse(start_date)) / 86400000) + 1;
    const [b] = await q('INSERT INTO bookings (equipment_id,user_id,start_date,end_date,total) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [e.id, req.user.id, start_date, end_date, days * e.price_per_day]);
    await logActivity(q, req.user.id, 'booked_equipment', `Requested ${e.name} for ${days} day(s), ${start_date} to ${end_date}`);
    return b.id;
  });
  res.status(201).json({ id });
});

export default r;
