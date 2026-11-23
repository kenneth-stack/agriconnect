import { Router } from 'express';
import { query, one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { upload, saveImages, purgeImages } from '../upload.js';
import { HttpError } from '../http.js';
import { r2Enabled, getImage, deleteImage, publicUrl } from '../storage.js';
import { CATEGORIES, UNITS } from '../meta.js';

const r = Router();

const LIST_SQL = `
SELECT l.id, l.title, l.category, l.description, l.quantity, l.unit, l.price, l.created_at,
       u.id AS farmer_id, u.name AS farmer, u.state,
       (SELECT id FROM images i WHERE i.listing_id = l.id ORDER BY i.id LIMIT 1) AS image_id,
       (SELECT COALESCE(json_agg(i.id ORDER BY i.id), '[]'::json) FROM images i WHERE i.listing_id = l.id) AS image_ids
FROM listings l JOIN users u ON u.id = l.seller_id
WHERE l.status = 'available' AND l.quantity > 0
  AND ($1::text IS NULL OR u.state = $1) AND ($2::text IS NULL OR l.category = $2)
  AND ($3::int IS NULL OR l.seller_id = $3) AND ($4::text IS NULL OR l.title ILIKE '%' || $4 || '%')
ORDER BY l.created_at DESC LIMIT 200`;

async function targetFarmer(req) {
  const id = req.user.role === 'admin' ? Number(req.body.farmer_id) : req.user.id;
  const f = await one("SELECT id, name FROM users WHERE id=$1 AND role='farmer' AND deleted_at IS NULL", [id || 0]);
  if (!f) throw new HttpError(400, 'Choose a farmer.');
  return f;
}

/* Public browsing */
r.get('/listings', async (req, res) => {
  const { state, category, farmer, q } = req.query;
  res.json(await query(LIST_SQL, [state || null, category || null, Number(farmer) || null, q || null]));
});

// Home page: every category with its count and latest items
r.get('/listings/summary', async (_q, res) => {
  const counts = await query("SELECT category, COUNT(*)::int AS n FROM listings WHERE status='available' AND quantity>0 GROUP BY category");
  const recent = await query(LIST_SQL, [null, null, null, null]);
  res.json(CATEGORIES.map((c) => ({
    category: c,
    count: counts.find((x) => x.category === c)?.n || 0,
    items: recent.filter((l) => l.category === c).slice(0, 4)
  })));
});

r.get('/farmers', async (req, res) => {
  res.json(await query(`
    SELECT u.id, u.name, u.state, p.main_crops,
      (SELECT COUNT(*)::int FROM listings l WHERE l.seller_id = u.id AND l.status='available' AND l.quantity>0) AS listings,
      (SELECT id FROM images i WHERE i.owner_id = u.id AND i.kind='farmland' ORDER BY id LIMIT 1) AS photo_id
    FROM users u LEFT JOIN farmer_profiles p ON p.user_id = u.id
    WHERE u.role='farmer' AND u.deleted_at IS NULL AND ($1::text IS NULL OR u.state = $1)
    ORDER BY listings DESC, u.name LIMIT 200`, [req.query.state || null]));
});

r.get('/farmers/:id', async (req, res) => {
  const f = await one(`SELECT u.id, u.name, u.state, p.farm_size_ha, p.main_crops, p.about
    FROM users u LEFT JOIN farmer_profiles p ON p.user_id = u.id WHERE u.id=$1 AND u.role='farmer' AND u.deleted_at IS NULL`, [Number(req.params.id) || 0]);
  if (!f) throw new HttpError(404, 'Farmer not found.');
  f.avatar_id = (await one("SELECT id FROM images WHERE owner_id=$1 AND kind='avatar' ORDER BY id DESC LIMIT 1", [f.id]))?.id || null;
  f.farms = await query('SELECT id, name, state, lga, size_ha, main_crops FROM farms WHERE user_id=$1 ORDER BY id', [f.id]); // no GPS in public
  f.photos = await query("SELECT id, caption FROM images WHERE owner_id=$1 AND kind='farmland' ORDER BY id DESC", [f.id]);
  res.json(f);
});

r.get('/images/:id', async (req, res) => {
  const row = await one('SELECT content_type, data, storage_key, kind FROM images WHERE id=$1', [Number(req.params.id) || 0]);
  if (!row || row.kind === 'kyc_id') throw new HttpError(404, 'Not found.'); // ID cards are private
  res.set('Cache-Control', 'public, max-age=86400');
  if (row.storage_key) {
    const url = publicUrl(row.storage_key);
    if (url) return res.redirect(302, url);            // bucket has a public domain
    if (!r2Enabled()) throw new HttpError(503, 'Image storage is not configured.');
    const stream = await getImage(row.storage_key);     // private bucket: stream through the API
    res.type(row.content_type);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }
  res.set('Content-Type', row.content_type).send(Buffer.from(row.data));
});

/* Farmers (or an admin on their behalf) */
r.post('/listings', requireAuth('farmer', 'admin'), needKyc, upload.array('images', 4), async (req, res) => {
  const b = req.body;
  const farmer = await targetFarmer(req);
  const price = Number(b.price), quantity = Number(b.quantity);
  if (!b.title?.trim()) throw new HttpError(400, 'Give the produce a name.');
  if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Pick a category.');
  if (!(price > 0) || !(quantity > 0)) throw new HttpError(400, 'Price and quantity must be above zero.');
  const unit = UNITS.includes(b.unit) ? b.unit : 'kg';
  const id = await tx(async (q) => {
    const [row] = await q(
      'INSERT INTO listings (seller_id,created_by,title,category,description,quantity,unit,price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [farmer.id, req.user.id, b.title.trim(), b.category, b.description || null, quantity, unit, price]);
    await saveImages(q, req.files, { owner_id: farmer.id, kind: 'produce', listing_id: row.id });
    const by = req.user.role === 'admin' ? ' (added by admin)' : '';
    await logActivity(q, farmer.id, 'listed_produce', `Listed ${quantity} ${unit} of ${b.title.trim()} under ${b.category}${by}`);
    return row.id;
  });
  res.status(201).json({ id });
});

r.delete('/listings/:id', requireAuth('farmer', 'admin'), async (req, res) => {
  const l = await one('SELECT id, seller_id, title FROM listings WHERE id=$1', [Number(req.params.id) || 0]);
  if (!l) throw new HttpError(404, 'Listing not found.');
  if (req.user.role !== 'admin' && l.seller_id !== req.user.id) throw new HttpError(403, 'This is not your listing.');
  if (await one("SELECT 1 FROM orders WHERE listing_id=$1 AND status IN ('pending','confirmed')", [l.id]))
    throw new HttpError(400, 'This produce has open orders. Complete or cancel them first.');
  await tx(async (q) => {
    await q("UPDATE listings SET status='removed' WHERE id=$1", [l.id]); // order history keeps the record; the photos are deleted
    await purgeImages(q, 'listing_id=$1', [l.id]);
    await logActivity(q, l.seller_id, 'removed_produce', `Deleted listing: ${l.title}`);
  });
  res.json({ ok: true });
});

r.put('/farm/profile', requireAuth('farmer'), needKyc, async (req, res) => {
  const { farm_size_ha, main_crops, about } = req.body;
  await query(`INSERT INTO farmer_profiles (user_id, farm_size_ha, main_crops, about) VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id) DO UPDATE SET farm_size_ha=$2, main_crops=$3, about=$4`,
    [req.user.id, Number(farm_size_ha) || null, main_crops || null, about || null]);
  res.json({ ok: true });
});

r.post('/farm/photos', requireAuth('farmer', 'admin'), needKyc, upload.array('images', 6), async (req, res) => {
  const farmer = await targetFarmer(req);
  if (!req.files?.length) throw new HttpError(400, 'Choose at least one photo.');
  await tx(async (q) => {
    await saveImages(q, req.files, { owner_id: farmer.id, kind: 'farmland', caption: req.body.caption });
    await logActivity(q, farmer.id, 'uploaded_photos', `Uploaded ${req.files.length} farm photo(s)`);
  });
  res.status(201).json({ ok: true });
});

r.delete('/images/:id', requireAuth('farmer', 'admin'), async (req, res) => {
  const img = await one('SELECT id, owner_id, storage_key FROM images WHERE id=$1', [Number(req.params.id) || 0]);
  if (!img) throw new HttpError(404, 'Photo not found.');
  if (req.user.role !== 'admin' && img.owner_id !== req.user.id) throw new HttpError(403, 'This is not your photo.');
  await query('DELETE FROM images WHERE id=$1', [img.id]);
  if (img.storage_key && r2Enabled()) await deleteImage(img.storage_key).catch((e) => console.error('R2 delete failed', e.message));
  res.json({ ok: true });
});

export default r;
