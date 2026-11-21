import { Router } from 'express';
import { query, one, tx, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError } from '../http.js';
import { STATES } from '../meta.js';
import { upload, saveImages, purgeImages } from '../upload.js';

const r = Router();

r.get('/profile', requireAuth(), async (req, res) => {
  const uid = req.user.id;
  const u = await one('SELECT id, name, email, role, phone, state, created_at FROM users WHERE id=$1', [uid]);
  const avatar = await one("SELECT id FROM images WHERE owner_id=$1 AND kind='avatar' ORDER BY id DESC LIMIT 1", [uid]);
  const kyc = await one('SELECT dob::text AS dob, phone, address, state, lga, id_type, id_last4, bvn_last4, status, review_note FROM kyc WHERE user_id=$1', [uid]);
  const farmer = u.role === 'farmer';
  res.json({
    ...u, avatar_id: avatar?.id || null, kyc: kyc || { status: 'none' },
    farms: farmer ? await query('SELECT id, name, address, state, lga, size_ha, main_crops, latitude, longitude FROM farms WHERE user_id=$1 ORDER BY id', [uid]) : [],
    payout: u.role !== 'admin' ? (await one('SELECT bank_name, account_number, account_name FROM payout_accounts WHERE user_id=$1', [uid])) || null : null
  });
});

r.put('/profile', requireAuth(), async (req, res) => {
  const name = (req.body.name || '').trim(), phone = (req.body.phone || '').trim(), state = (req.body.state || '').trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your full name.');
  if (phone && !/^\+?\d[\d\s-]{6,15}$/.test(phone)) throw new HttpError(400, 'Enter a valid phone number.');
  if (state && !STATES.includes(state)) throw new HttpError(400, 'Choose a valid state.');
  if (!state && ['farmer', 'buyer'].includes(req.user.role)) throw new HttpError(400, 'Choose your state.');
  await query('UPDATE users SET name=$1, phone=$2, state=COALESCE($3, state) WHERE id=$4', [name, phone || null, state || null, req.user.id]);
  res.json({ ok: true });
});

r.post('/profile/avatar', requireAuth(), upload.single('image'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a photo.');
  const id = await tx(async (q) => {
    await saveImages(q, [req.file], { owner_id: req.user.id, kind: 'avatar' });
    const [{ id }] = await q("SELECT id FROM images WHERE owner_id=$1 AND kind='avatar' ORDER BY id DESC LIMIT 1", [req.user.id]);
    await purgeImages(q, "owner_id=$1 AND kind='avatar' AND id <> $2", [req.user.id, id]); // keep only the newest
    await logActivity(q, req.user.id, 'profile_photo', 'Updated profile picture');
    return id;
  });
  res.status(201).json({ avatar_id: id });
});

r.delete('/profile/avatar', requireAuth(), async (req, res) => {
  await tx((q) => purgeImages(q, "owner_id=$1 AND kind='avatar'", [req.user.id]));
  res.json({ ok: true });
});

// Farmers say where AgriConnect should send their money after a prepaid order is delivered
r.put('/profile/payout', requireAuth('farmer', 'investor', 'buyer'), async (req, res) => {
  const { bank_name, account_number, account_name } = req.body;
  if (!bank_name?.trim() || !account_name?.trim() || !/^\d{10}$/.test(account_number || '')) throw new HttpError(400, 'Enter the bank, a 10-digit account number and the account name.');
  await query(`INSERT INTO payout_accounts (user_id, bank_name, account_number, account_name) VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id) DO UPDATE SET bank_name=$2, account_number=$3, account_name=$4`, [req.user.id, bank_name.trim(), account_number, account_name.trim()]);
  res.json({ ok: true });
});

export default r;
