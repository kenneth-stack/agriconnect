import pg from 'pg';

let pool, lite;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  phone TEXT, state TEXT, language TEXT DEFAULT 'en',
  role TEXT NOT NULL CHECK (role IN ('farmer','investor','buyer','admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS farmer_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id), farm_size_ha DOUBLE PRECISION, main_crops TEXT, about TEXT
);
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY, seller_id INT NOT NULL REFERENCES users(id), created_by INT REFERENCES users(id),
  title TEXT NOT NULL, category TEXT NOT NULL, description TEXT,
  quantity DOUBLE PRECISION NOT NULL, unit TEXT NOT NULL, price DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_cat ON listings(category);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY, listing_id INT NOT NULL REFERENCES listings(id),
  buyer_id INT NOT NULL REFERENCES users(id), farmer_id INT NOT NULL REFERENCES users(id),
  quantity DOUBLE PRECISION NOT NULL, total DOUBLE PRECISION NOT NULL, delivery_state TEXT, note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY, farmer_id INT NOT NULL REFERENCES users(id), title TEXT NOT NULL, crop TEXT, description TEXT,
  amount_needed DOUBLE PRECISION NOT NULL, amount_funded DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS investments (
  id SERIAL PRIMARY KEY, project_id INT NOT NULL REFERENCES projects(id),
  investor_id INT NOT NULL REFERENCES users(id), amount DOUBLE PRECISION NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, description TEXT, state TEXT,
  price_per_day DOUBLE PRECISION NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
  created_by INT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY, equipment_id INT NOT NULL REFERENCES equipment(id), user_id INT NOT NULL REFERENCES users(id),
  start_date DATE NOT NULL, end_date DATE NOT NULL, total DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS images (
  id SERIAL PRIMARY KEY, owner_id INT REFERENCES users(id), kind TEXT NOT NULL,
  listing_id INT REFERENCES listings(id), equipment_id INT REFERENCES equipment(id),
  caption TEXT, content_type TEXT NOT NULL, data BYTEA, storage_key TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS images_listing ON images(listing_id);
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), action TEXT NOT NULL, detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_user ON activity(user_id);
ALTER TABLE images ALTER COLUMN data DROP NOT NULL;
ALTER TABLE images ADD COLUMN IF NOT EXISTS storage_key TEXT;
`;

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Render's internal URL (host without dots) needs no SSL; external URLs do.
    const host = new URL(url).hostname;
    const ssl = process.env.DATABASE_SSL
      ? process.env.DATABASE_SSL !== 'false'
      : host.includes('.') && host !== 'localhost';
    pool = new pg.Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false });
    await pool.query(SCHEMA);
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    lite = new PGlite(process.env.PGLITE_DIR || './.pgdata');
    await lite.exec(SCHEMA);
    console.log('No DATABASE_URL set: using embedded local Postgres in ./.pgdata');
  }
}

export async function query(text, params = []) {
  const res = pool ? await pool.query(text, params) : await lite.query(text, params);
  return res.rows;
}
export const one = async (text, params) => (await query(text, params))[0];

// Runs fn inside a transaction; fn receives a query function bound to it.
export async function tx(fn) {
  if (lite) return lite.transaction((t) => fn(async (text, params = []) => (await t.query(text, params)).rows));
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(async (text, params = []) => (await c.query(text, params)).rows);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export const logActivity = (q, userId, action, detail) =>
  q('INSERT INTO activity (user_id,action,detail) VALUES ($1,$2,$3)', [userId, action, detail]);
