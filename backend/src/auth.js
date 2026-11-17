import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one, query } from './db.js';
import { HttpError } from './http.js';

export const sign = (u) => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

export function requireAuth(...roles) {
  return async (req, _res, next) => {
    try {
      req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'Please log in to continue.');
    }
    if (req.user.role === 'admin') {
      // a token can outlive admin access, so confirm against the database
      const u = await one('SELECT role FROM users WHERE id=$1', [req.user.id]);
      if (u?.role !== 'admin') throw new HttpError(401, 'Your session is no longer valid. Please log in again.');
    }
    if (roles.length && !roles.includes(req.user.role)) throw new HttpError(403, 'Your account type cannot do this.');
    next();
  };
}

// Farmers, investors and buyers must complete their KYC profile before acting on the platform.
export async function needKyc(req, _res, next) {
  if (req.user.role === 'admin') return next();
  const k = await one('SELECT status FROM kyc WHERE user_id=$1', [req.user.id]);
  if (!['submitted', 'verified'].includes(k?.status))
    throw new HttpError(403, 'Please complete your KYC profile before you continue.');
  next();
}

// Admins cannot register publicly: the first one is created from env vars.
export async function ensureAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin account created.');
  const email = ADMIN_EMAIL.toLowerCase();
  if (await one('SELECT id FROM users WHERE email=$1', [email])) return;
  await query("INSERT INTO users (name,email,password_hash,role) VALUES ('Administrator',$1,$2,'admin')", [email, bcrypt.hashSync(ADMIN_PASSWORD, 10)]);
  console.log('Admin account created for', email);
}
