import { Router } from 'express';
import { query, one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';
import { encrypt } from '../secure.js';
import { STATES, ID_TYPES } from '../meta.js';
import { paystackEnabled } from '../paystack.js';
import { provisionAccount } from '../wallet.js';

const r = Router();
const FARM_COLS = 'id, name, address, state, lga, size_ha, main_crops, latitude, longitude';

// Validates the list of farms a farmer fills in (location text is required; GPS coordinates are optional but must be a pair)
function cleanFarms(farms) {
  if (!Array.isArray(farms) || !farms.length) throw new HttpError(400, 'Add at least one farm.');
  if (farms.length > 20) throw new HttpError(400, 'You can add up to 20 farms.');
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return farms.map((f, i) => {
    const n = `Farm ${i + 1}`, lat = num(f.latitude), lng = num(f.longitude), size = num(f.size_ha);
    if (!f.address || f.address.trim().length < 3) throw new HttpError(400, `${n}: enter the farm location or address.`);
    if (!STATES.includes(f.state)) throw new HttpError(400, `${n}: choose the state.`);
    if ((lat === null) !== (lng === null) || (lat !== null && !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)))
      throw new HttpError(400, `${n}: the GPS coordinates are not valid (both latitude and longitude are needed).`);
    if (size !== null && !(size > 0)) throw new HttpError(400, `${n}: farm size must be above zero.`);
    return { name: (f.name || '').trim() || n, address: f.address.trim(), state: f.state, lga: (f.lga || '').trim() || null, size, crops: (f.main_crops || '').trim() || null, lat, lng };
  });
}
async function saveFarms(q, userId, farms) {
  await q('DELETE FROM farms WHERE user_id=$1', [userId]);
  for (const f of farms) await q('INSERT INTO farms (user_id,name,address,state,lga,size_ha,main_crops,latitude,longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [userId, f.name, f.address, f.state, f.lga, f.size, f.crops, f.lat, f.lng]);
}

r.get('/kyc/me', requireAuth(), async (req, res) => {
  const k = await one(`SELECT dob::text AS dob, phone, address, state, lga, id_type, id_last4, bvn_last4, status, review_note FROM kyc WHERE user_id=$1`, [req.user.id]);
  const farms = req.user.role === 'farmer' ? await query(`SELECT ${FARM_COLS} FROM farms WHERE user_id=$1 ORDER BY id`, [req.user.id]) : [];
  res.json({ ...(k || { status: 'none' }), farms });
});

// BVN and ID number are stored encrypted; only the last 4 digits are kept in plain form for display.
r.put('/kyc', requireAuth('farmer', 'investor', 'buyer'), async (req, res) => {
  const b = req.body, uid = req.user.id;
  const old = await one('SELECT status, bvn_enc, bvn_last4, id_number_enc, id_last4 FROM kyc WHERE user_id=$1', [uid]);
  if (old?.status === 'verified') throw new HttpError(400, 'Your profile is already verified. Contact support to change it.');
  const age = (Date.now() - Date.parse(b.dob)) / 31557600000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dob || '') || !(age >= 18 && age < 110)) throw new HttpError(400, 'Enter a valid date of birth. You must be 18 or older.');
  if (!/^\+?\d[\d\s-]{9,15}$/.test(b.phone || '')) throw new HttpError(400, 'Enter a valid phone number.');
  if (!b.address || b.address.trim().length < 5) throw new HttpError(400, 'Enter your house address.');
  if (!STATES.includes(b.state)) throw new HttpError(400, 'Choose your state.');
  if (!ID_TYPES.includes(b.id_type)) throw new HttpError(400, 'Choose an ID type.');
  const idNum = (b.id_number || '').replace(/\s/g, ''), bvn = (b.bvn || '').replace(/\s/g, '');
  if (bvn && !/^\d{11}$/.test(bvn)) throw new HttpError(400, 'BVN must be exactly 11 digits.');
  if (idNum && !/^[A-Za-z0-9-]{5,25}$/.test(idNum)) throw new HttpError(400, 'Enter a valid ID number.');
  if (!bvn && !old) throw new HttpError(400, 'BVN is required.');
  if (!idNum && !old) throw new HttpError(400, 'ID number is required.');
  const farms = req.user.role === 'farmer' ? cleanFarms(b.farms) : null;
  const bvnEnc = bvn ? encrypt(bvn) : old.bvn_enc, bvnLast = bvn ? bvn.slice(-4) : old.bvn_last4;
  const idEnc = idNum ? encrypt(idNum) : old.id_number_enc, idLast = idNum ? idNum.slice(-4) : old.id_last4;
  await tx(async (q) => {
    await q(`INSERT INTO kyc (user_id,dob,phone,address,state,lga,id_type,id_number_enc,id_last4,bvn_enc,bvn_last4,status,submitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'submitted',now())
      ON CONFLICT (user_id) DO UPDATE SET dob=$2, phone=$3, address=$4, state=$5, lga=$6, id_type=$7, id_number_enc=$8, id_last4=$9,
        bvn_enc=$10, bvn_last4=$11, status='submitted', review_note=NULL, submitted_at=now(), reviewed_at=NULL`,
      [uid, b.dob, b.phone, b.address.trim(), b.state, b.lga || null, b.id_type, idEnc, idLast, bvnEnc, bvnLast]);
    if (farms) await saveFarms(q, uid, farms);
    await logActivity(q, uid, 'kyc_submitted', 'Submitted KYC profile');
  });
  // investors and buyers get their own account number once KYC is in
  if (['investor', 'buyer'].includes(req.user.role) && paystackEnabled()) provisionAccount(uid).catch(() => {});
  res.json({ status: 'submitted' });
});

// Farmers can add or change farms at any time, even after verification
r.put('/kyc/farms', requireAuth('farmer'), needKyc, async (req, res) => {
  const farms = cleanFarms(req.body.farms);
  await tx(async (q) => { await saveFarms(q, req.user.id, farms); await logActivity(q, req.user.id, 'farms_updated', `Updated farm list (${farms.length} farm${farms.length > 1 ? 's' : ''})`); });
  res.json({ ok: true });
});

export default r;
