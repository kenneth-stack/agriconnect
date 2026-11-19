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
CREATE TABLE IF NOT EXISTS kyc (
  user_id INT PRIMARY KEY REFERENCES users(id), dob DATE NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
  state TEXT NOT NULL, lga TEXT, id_type TEXT NOT NULL, id_number_enc TEXT NOT NULL, id_last4 TEXT NOT NULL,
  bvn_enc TEXT NOT NULL, bvn_last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','verified','rejected')),
  review_note TEXT, submitted_at TIMESTAMPTZ DEFAULT now(), reviewed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS assistance_requests (
  id SERIAL PRIMARY KEY, farmer_id INT NOT NULL REFERENCES users(id), item TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL, unit TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT, reviewed_by INT REFERENCES users(id), reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS investment_plans (
  id SERIAL PRIMARY KEY, duration_months INT UNIQUE NOT NULL, rate_percent DOUBLE PRECISION NOT NULL,
  min_amount DOUBLE PRECISION NOT NULL DEFAULT 50000, active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS plan_investments (
  id SERIAL PRIMARY KEY, investor_id INT NOT NULL REFERENCES users(id), plan_id INT NOT NULL REFERENCES investment_plans(id),
  amount DOUBLE PRECISION NOT NULL, duration_months INT NOT NULL, rate_percent DOUBLE PRECISION NOT NULL,
  expected_return DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paid','cancelled')),
  start_date TIMESTAMPTZ, maturity_date TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS resets_hash ON password_resets(token_hash);
CREATE TABLE IF NOT EXISTS wallets (
  user_id INT PRIMARY KEY REFERENCES users(id), balance DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (balance >= 0)
);
CREATE TABLE IF NOT EXISTS virtual_accounts (
  user_id INT PRIMARY KEY REFERENCES users(id), account_number TEXT UNIQUE NOT NULL, account_name TEXT, bank_name TEXT,
  paystack_customer_code TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), type TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL,
  balance_after DOUBLE PRECISION NOT NULL, description TEXT, reference TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wtx_user ON wallet_transactions(user_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id INT PRIMARY KEY REFERENCES users(id), bank_name TEXT, account_number TEXT, account_name TEXT
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_total DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'pod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pay_on_delivery';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment TEXT NOT NULL DEFAULT 'delivery';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS farms (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), name TEXT, address TEXT NOT NULL, state TEXT NOT NULL, lga TEXT,
  size_ha DOUBLE PRECISION, main_crops TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, created_at TIMESTAMPTZ DEFAULT now()
);
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
    console.log('No DATABASE_URL set: using embedded local Postgres in '+(process.env.PGLITE_DIR || './.pgdata')+'');
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
