import { Router } from 'express';
import { query, one, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError } from '../http.js';
import { encrypt } from '../secure.js';
import { STATES, ID_TYPES } from '../meta.js';

const r = Router();

r.get('/kyc/me', requireAuth(), async (req, res) => {
  const k = await one(`SELECT dob::text AS dob, phone, address, state, lga, id_type, id_last4, bvn_last4, status, review_note
    FROM kyc WHERE user_id=$1`, [req.user.id]);
  res.json(k || { status: 'none' });
});

// BVN and ID number are stored encrypted; only the last 4 digits are kept in plain form for display.
r.put('/kyc', requireAuth('farmer', 'investor', 'buyer'), async (req, res) => {
  const b = req.body;
  const old = await one('SELECT status, bvn_enc, bvn_last4, id_number_enc, id_last4 FROM kyc WHERE user_id=$1', [req.user.id]);
  if (old?.status === 'verified') throw new HttpError(400, 'Your profile is already verified. Contact support to change it.');
  const age = (Date.now() - Date.parse(b.dob)) / 31557600000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dob || '') || !(age >= 18 && age < 110)) throw new HttpError(400, 'Enter a valid date of birth. You must be 18 or older.');
  if (!/^\+?\d[\d\s-]{9,15}$/.test(b.phone || '')) throw new HttpError(400, 'Enter a valid phone number.');
  if (!b.address || b.address.trim().length < 5) throw new HttpError(400, 'Enter your home or farm address.');
  if (!STATES.includes(b.state)) throw new HttpError(400, 'Choose your state.');
  if (!ID_TYPES.includes(b.id_type)) throw new HttpError(400, 'Choose an ID type.');
  const idNum = (b.id_number || '').replace(/\s/g, ''), bvn = (b.bvn || '').replace(/\s/g, '');
  if (bvn && !/^\d{11}$/.test(bvn)) throw new HttpError(400, 'BVN must be exactly 11 digits.');
  if (idNum && !/^[A-Za-z0-9-]{5,25}$/.test(idNum)) throw new HttpError(400, 'Enter a valid ID number.');
  if (!bvn && !old) throw new HttpError(400, 'BVN is required.');
  if (!idNum && !old) throw new HttpError(400, 'ID number is required.');
  const bvnEnc = bvn ? encrypt(bvn) : old.bvn_enc, bvnLast = bvn ? bvn.slice(-4) : old.bvn_last4;
  const idEnc = idNum ? encrypt(idNum) : old.id_number_enc, idLast = idNum ? idNum.slice(-4) : old.id_last4;
  await query(`INSERT INTO kyc (user_id,dob,phone,address,state,lga,id_type,id_number_enc,id_last4,bvn_enc,bvn_last4,status,submitted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'submitted',now())
    ON CONFLICT (user_id) DO UPDATE SET dob=$2, phone=$3, address=$4, state=$5, lga=$6, id_type=$7, id_number_enc=$8, id_last4=$9,
      bvn_enc=$10, bvn_last4=$11, status='submitted', review_note=NULL, submitted_at=now(), reviewed_at=NULL`,
    [req.user.id, b.dob, b.phone, b.address.trim(), b.state, b.lga || null, b.id_type, idEnc, idLast, bvnEnc, bvnLast]);
  await logActivity(query, req.user.id, 'kyc_submitted', 'Submitted KYC profile');
  res.json({ status: 'submitted' });
});

export default r;
