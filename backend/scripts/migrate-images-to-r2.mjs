// Moves photos that are stored in Postgres over to Cloudflare R2.
// Run once after setting the R2_* variables:  node scripts/migrate-images-to-r2.mjs
import 'dotenv/config';
import { initDb, query } from '../src/db.js';
import { r2Enabled, putImage } from '../src/storage.js';

if (!r2Enabled()) throw new Error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET first.');
await initDb();
const ids = (await query('SELECT id FROM images WHERE storage_key IS NULL AND data IS NOT NULL ORDER BY id')).map((r) => r.id);
console.log(`${ids.length} photo(s) to move`);
let moved = 0;
for (const id of ids) {
  const [row] = await query('SELECT kind, content_type, data FROM images WHERE id=$1', [id]);
  const key = await putImage(Buffer.from(row.data), row.content_type, row.kind);
  await query('UPDATE images SET storage_key=$1, data=NULL WHERE id=$2', [key, id]); // only cleared after a successful upload
  moved++;
}
console.log(`Moved ${moved}. To shrink the database file afterwards, run: VACUUM FULL images;`);
process.exit(0);
