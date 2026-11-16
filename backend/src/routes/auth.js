import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, one, logActivity } from '../db.js';
import { sign } from '../auth.js';
import { HttpError } from '../http.js';
import { STATES, CATEGORIES, UNITS, EQUIPMENT_TYPES } from '../meta.js';

const r = Router();

r.get('/meta', (_q, res) => res.json({ categories: CATEGORIES, states: STATES, units: UNITS, equipmentTypes: EQUIPMENT_TYPES }));

r.post('/auth/register', async (req, res) => {
  const { name, email, password, role = 'farmer', phone, state, language = 'en' } = req.body;
  if (!name || !email || !(password?.length >= 8)) throw new HttpError(400, 'Name, email and a password of 8+ characters are required.');
  if (!['farmer', 'investor', 'buyer'].includes(role)) throw new HttpError(400, 'Invalid account type.');
  if (['farmer', 'buyer'].includes(role) && !STATES.includes(state)) throw new HttpError(400, 'Please choose your state.');
  try {
    const u = await one(
      'INSERT INTO users (name,email,password_hash,role,phone,state,language) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [name, email.toLowerCase(), bcrypt.hashSync(password, 10), role, phone || null, state || null, language]
    );
    await logActivity(query, u.id, 'registered', `Joined AgriConnect as ${role}`);
    const user = { id: u.id, name, email: email.toLowerCase(), role, state: state || null };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'That email is already registered.');
    throw e;
  }
});

r.post('/auth/login', async (req, res) => {
  const u = await one('SELECT * FROM users WHERE email=$1', [(req.body.email || '').toLowerCase()]);
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) throw new HttpError(401, 'Email or password is wrong.');
  await logActivity(query, u.id, 'login', 'Signed in');
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role, state: u.state } });
});

export default r;
