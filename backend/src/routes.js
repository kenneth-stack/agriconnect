import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { sign, requireAuth } from './auth.js';

const r = Router();
const need = (res, cond, msg) => (cond ? false : (res.status(400).json({ error: msg }), true));

/* ---------- Feature flags (frontend hides AI until a key is set) ---------- */

/* ---------- Auth ---------- */
r.post('/auth/register', (req, res) => {
  const { name, email, password, role = 'farmer', phone, language = 'en' } = req.body;
  if (need(res, name && email && password?.length >= 8, 'Name, email and a password of 8+ characters are required.')) return;
  if (need(res, ['farmer', 'investor', 'buyer', 'provider'].includes(role), 'Invalid account type.')) return;
  try {
    const info = db.prepare(
      'INSERT INTO users (name,email,password_hash,role,phone,language) VALUES (?,?,?,?,?,?)'
    ).run(name, email.toLowerCase(), bcrypt.hashSync(password, 10), role, phone, language);
    const user = { id: info.lastInsertRowid, name, email, role };
    res.status(201).json({ token: sign(user), user });
  } catch {
    res.status(409).json({ error: 'That email is already registered.' });
  }
});

r.post('/auth/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((req.body.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash))
    return res.status(401).json({ error: 'Email or password is wrong.' });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

/* ---------- Farm profile ---------- */
r.get('/farms/me', requireAuth('farmer'), (req, res) =>
  res.json(db.prepare('SELECT * FROM farms WHERE user_id=?').all(req.user.id)));

r.post('/farms', requireAuth('farmer'), (req, res) => {
  const { state, lat, lng, crop, size_ha, yield_history } = req.body;
  const info = db.prepare(
    'INSERT INTO farms (user_id,state,lat,lng,crop,size_ha,yield_history) VALUES (?,?,?,?,?,?,?)'
  ).run(req.user.id, state, lat, lng, crop, size_ha, yield_history);
  res.status(201).json({ id: info.lastInsertRowid });
});

/* ---------- Consumer / processor marketplace ---------- */
r.get('/listings', (req, res) => {
  const { category, state, q } = req.query;
  const rows = db.prepare(`
    SELECT l.*, u.name AS seller FROM listings l JOIN users u ON u.id=l.seller_id
    WHERE (@category IS NULL OR category=@category)
      AND (@state IS NULL OR state=@state)
      AND (@q IS NULL OR title LIKE '%'||@q||'%')
    ORDER BY l.created_at DESC LIMIT 100`)
    .all({ category: category || null, state: state || null, q: q || null });
  res.json(rows);
});

r.post('/listings', requireAuth('farmer'), (req, res) => {
  const { title, category, quantity, unit, price, state } = req.body;
  if (need(res, title && price > 0, 'Title and a price above zero are required.')) return;
  const info = db.prepare(
    'INSERT INTO listings (seller_id,title,category,quantity,unit,price,state) VALUES (?,?,?,?,?,?,?)'
  ).run(req.user.id, title, category, quantity, unit, price, state);
  res.status(201).json({ id: info.lastInsertRowid });
});

/* ---------- Investment marketplace ---------- */
r.get('/projects', (_req, res) =>
  res.json(db.prepare(`SELECT p.*, u.name AS farmer FROM projects p
    JOIN users u ON u.id=p.farmer_id WHERE status='open' ORDER BY created_at DESC`).all()));

r.post('/projects', requireAuth('farmer'), (req, res) => {
  const { title, crop, state, description, amount_needed } = req.body;
  if (need(res, title && amount_needed > 0, 'Title and amount needed are required.')) return;
  const info = db.prepare(
    'INSERT INTO projects (farmer_id,title,crop,state,description,amount_needed) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, title, crop, state, description, amount_needed);
  res.status(201).json({ id: info.lastInsertRowid });
});

r.post('/projects/:id/invest', requireAuth('investor'), (req, res) => {
  const amount = Number(req.body.amount);
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p || p.status !== 'open') return res.status(404).json({ error: 'Project not open for funding.' });
  if (need(res, amount > 0 && amount <= p.amount_needed - p.amount_funded, 'Amount exceeds what is still needed.')) return;

  // Atomic: record investment, update funding, close when fully funded
  db.transaction(() => {
    db.prepare('INSERT INTO investments (project_id,investor_id,amount) VALUES (?,?,?)').run(p.id, req.user.id, amount);
    db.prepare("UPDATE projects SET amount_funded=amount_funded+?, status=CASE WHEN amount_funded+?>=amount_needed THEN 'funded' ELSE status END WHERE id=?")
      .run(amount, amount, p.id);
  })();
  res.status(201).json({ ok: true, note: 'Wire a payment gateway with escrow (e.g. Paystack) here before real money moves.' });
});

/* ---------- Mechanization marketplace ---------- */
r.get('/equipment', (req, res) =>
  res.json(db.prepare(`SELECT e.*, u.name AS owner FROM equipment e JOIN users u ON u.id=e.owner_id
    WHERE (? IS NULL OR e.type=?) ORDER BY e.price_per_day`).all(req.query.type || null, req.query.type || null)));

r.post('/equipment', requireAuth('provider'), (req, res) => {
  const { type, name, price_per_day, state } = req.body;
  const info = db.prepare('INSERT INTO equipment (owner_id,type,name,price_per_day,state) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, name, price_per_day, state);
  res.status(201).json({ id: info.lastInsertRowid });
});

r.post('/equipment/:id/book', requireAuth('farmer', 'buyer'), (req, res) => {
  const { start_date, end_date } = req.body;
  if (need(res, start_date && end_date && end_date >= start_date, 'Choose valid start and end dates.')) return;
  const clash = db.prepare(`SELECT 1 FROM bookings WHERE equipment_id=? AND status!='cancelled'
    AND start_date<=? AND end_date>=?`).get(req.params.id, end_date, start_date);
  if (clash) return res.status(409).json({ error: 'That equipment is already booked on those dates.' });
  const info = db.prepare('INSERT INTO bookings (equipment_id,user_id,start_date,end_date) VALUES (?,?,?,?)')
    .run(req.params.id, req.user.id, start_date, end_date);
  res.status(201).json({ id: info.lastInsertRowid });
});

/* ---------- AI Farm Assistant (Claude API) ---------- */
const LANGS = { en: 'English', yo: 'Yoruba', ig: 'Igbo', ha: 'Hausa', pcm: 'Nigerian Pidgin' };

r.get('/ai/status', (_req, res) => res.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) }));

r.post('/ai/chat', requireAuth(), async (req, res) => {
  const { message, language = 'en', history = [] } = req.body;
  if (need(res, message, 'Type or speak a question first.')) return;
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ error: 'The AI assistant is coming soon.' });

  const system = `You are AgriConnect's farm assistant for Nigerian smallholder farmers. Reply in ${LANGS[language] || 'English'}, in short, simple sentences a low-literacy farmer can follow. Cover crop choice, planting and spraying timing, pest and disease signs, fertilizer, storage and selling. Never invent prices or weather data: if you lack live data, say so and tell the farmer to check the marketplace prices. For serious disease or livestock illness, advise contacting a local extension officer or vet.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 600,
        system,
        messages: [...history.slice(-10), { role: 'user', content: message }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'AI request failed');
    res.json({ reply: data.content.map((c) => c.text || '').join('') });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'The assistant is unavailable right now. Try again shortly.' });
  }
});

/* ---------- Price insight (placeholder: swap in real market data + ML) ---------- */
r.get('/prices/:commodity', (req, res) => {
  const rows = db.prepare(`SELECT state, ROUND(AVG(price),0) AS avg_price, COUNT(*) AS listings
    FROM listings WHERE title LIKE '%'||?||'%' GROUP BY state ORDER BY avg_price DESC`).all(req.params.commodity);
  res.json({ commodity: req.params.commodity, byState: rows, bestStateToSell: rows[0]?.state ?? null });
});

export default r;
