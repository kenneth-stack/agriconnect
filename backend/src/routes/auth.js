import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, one, logActivity } from '../db.js';
import { sign, requireAuth } from '../auth.js';
import { HttpError } from '../http.js';
import { sendMail, sendWelcome } from '../mailer.js';
import { STATES, CATEGORIES, UNITS, EQUIPMENT_TYPES, ASSISTANCE_ITEMS, ASSISTANCE_UNITS, ID_TYPES } from '../meta.js';

const r = Router();
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const kycStatus = async (id) => (await one('SELECT status FROM kyc WHERE user_id=$1', [id]))?.status || 'none';

r.get('/meta', (_q, res) => res.json({
  categories: CATEGORIES, states: STATES, units: UNITS, equipmentTypes: EQUIPMENT_TYPES,
  assistanceItems: ASSISTANCE_ITEMS, assistanceUnits: ASSISTANCE_UNITS, idTypes: ID_TYPES,
  paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true',
  paymentNote: process.env.PAYMENT_INSTRUCTIONS || 'Payment details will be shared by our team once you submit your investment.'
}));

r.post('/auth/register', async (req, res) => {
  const { name, email, password, role = 'farmer', phone, state, language = 'en' } = req.body;
  if (!name || !email || !(password?.length >= 8)) throw new HttpError(400, 'Name, email and a password of 8+ characters are required.');
  if (!['farmer', 'investor', 'buyer'].includes(role)) throw new HttpError(400, 'Invalid account type.');
  if (['farmer', 'buyer'].includes(role) && !STATES.includes(state)) throw new HttpError(400, 'Please choose your state.');
  const mail = email.toLowerCase().trim();
  const taken = new HttpError(409, 'Email already exists. Please log in, or use a different email.');
  if (await one('SELECT 1 FROM users WHERE email=$1', [mail])) throw taken;
  try {
    const u = await one(
      'INSERT INTO users (name,email,password_hash,role,phone,state,language) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [name, mail, bcrypt.hashSync(password, 10), role, phone || null, state || null, language]);
    await logActivity(query, u.id, 'registered', `Joined AgriConnect as ${role}`);
    const user = { id: u.id, name, email: mail, role, state: state || null, kyc: 'none' };
    sendWelcome({ name, email: mail, role }).catch(() => {}); // fire and forget
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (e.code === '23505') throw taken;
    throw e;
  }
});

r.post('/auth/login', async (req, res) => {
  const u = await one('SELECT * FROM users WHERE email=$1', [(req.body.email || '').toLowerCase().trim()]);
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) throw new HttpError(401, 'Email or password is wrong.');
  await logActivity(query, u.id, 'login', 'Signed in');
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role, state: u.state, kyc: await kycStatus(u.id) } });
});

r.post('/auth/change-password', requireAuth(), async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!(new_password?.length >= 8)) throw new HttpError(400, 'The new password must be at least 8 characters.');
  const u = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!bcrypt.compareSync(current_password || '', u.password_hash)) throw new HttpError(400, 'Your current password is wrong.');
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [bcrypt.hashSync(new_password, 10), req.user.id]);
  await logActivity(query, req.user.id, 'password_changed', 'Changed password');
  res.json({ ok: true });
});

// Forgot password: always answers the same way so it does not reveal which emails exist.
r.post('/auth/forgot', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const u = email && await one('SELECT id, name FROM users WHERE email=$1', [email]);
  const out = { ok: true, message: 'If that email is registered, a reset link is on its way. Check your inbox and spam folder.' };
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    await query("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [u.id, sha(token)]);
    const base = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
    const link = `${base}/reset-password?token=${token}`;
    const sent = await sendMail(email, 'Reset your AgriConnect password',
      `Hello ${u.name},\n\nUse this link within 1 hour to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email.`).catch(() => false);
    if (!sent) console.log('Email is not configured. Password reset link for', email, ':', link);
    if (process.env.EXPOSE_RESET_LINKS === 'true') out.debug_link = link; // tests only
  }
  res.json(out);
});

r.post('/auth/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!(password?.length >= 8)) throw new HttpError(400, 'The new password must be at least 8 characters.');
  const row = await one('SELECT id, user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()', [sha(token || '')]);
  if (!row) throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [bcrypt.hashSync(password, 10), row.user_id]);
  await query('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [row.user_id]);
  await logActivity(query, row.user_id, 'password_reset', 'Reset password using an email link');
  res.json({ ok: true });
});

export default r;
