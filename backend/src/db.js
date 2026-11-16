import Database from 'better-sqlite3';

// SQLite keeps the MVP zero-config. For production move to PostgreSQL (same schema).
const db = new Database(process.env.DB_FILE || 'agriconnect.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, phone TEXT, language TEXT DEFAULT 'en',
  role TEXT NOT NULL CHECK (role IN ('farmer','investor','buyer','provider','admin')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  state TEXT, lat REAL, lng REAL, crop TEXT, size_ha REAL, yield_history TEXT
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, category TEXT, quantity REAL, unit TEXT, price REAL NOT NULL,
  state TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, farmer_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, crop TEXT, state TEXT, description TEXT,
  amount_needed REAL NOT NULL, amount_funded REAL DEFAULT 0,
  farmer_pct REAL DEFAULT 40, investor_pct REAL DEFAULT 45, platform_pct REAL DEFAULT 15,
  status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
  investor_id INTEGER NOT NULL REFERENCES users(id), amount REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, name TEXT NOT NULL, price_per_day REAL NOT NULL, state TEXT
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  user_id INTEGER NOT NULL REFERENCES users(id), start_date TEXT NOT NULL,
  end_date TEXT NOT NULL, status TEXT DEFAULT 'pending'
);
`);

export default db;
