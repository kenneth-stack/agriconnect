import multer from 'multer';
import { HttpError } from './http.js';
import { one } from './db.js';
import { r2Enabled, putImage, deleteImage } from './storage.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 6 } });

// Trust the file's real bytes, not the name or declared type the browser sent.
export function sniff(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export async function saveImages(q, files = [], m) {
  const types = files.map((f) => sniff(f.buffer));
  if (types.some((t) => !t)) throw new HttpError(400, 'Only JPG, PNG or WebP photos are allowed.');
  for (const [i, f] of files.entries()) {
    const key = r2Enabled() && m.kind !== 'kyc_id' ? await putImage(f.buffer, types[i], m.kind) : null; // ID cards never go to a bucket
    await q(
      'INSERT INTO images (owner_id,kind,listing_id,equipment_id,caption,content_type,data,storage_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [m.owner_id ?? null, m.kind, m.listing_id ?? null, m.equipment_id ?? null, m.caption ?? null, types[i], key ? null : f.buffer, key]
    );
  }
}

// Deletes matching images and their files in R2. `where` is a fixed SQL condition written in our code, never user input.
export async function purgeImages(q, where, params) {
  const rows = await q(`DELETE FROM images WHERE ${where} RETURNING storage_key`, params);
  if (r2Enabled()) for (const r of rows) if (r.storage_key) await deleteImage(r.storage_key).catch((e) => console.error('R2 delete failed', e.message));
}

// Sends a person's ID card photo. Only call this after checking who is asking (the owner or an admin).
export async function sendIdCard(res, userId) {
  const row = await one("SELECT content_type, data FROM images WHERE owner_id=$1 AND kind='kyc_id' ORDER BY id DESC LIMIT 1", [userId]);
  if (!row) throw new HttpError(404, 'No ID card uploaded.');
  res.set({ 'Content-Type': row.content_type, 'Cache-Control': 'private, no-store' }).send(Buffer.from(row.data));
}
