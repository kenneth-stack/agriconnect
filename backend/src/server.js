import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db.js';
import { ensureAdmin } from './auth.js';
import { HttpError } from './http.js';
import auth from './routes/auth.js';
import market from './routes/market.js';
import trade from './routes/trade.js';
import equipment from './routes/equipment.js';
import me from './routes/me.js';
import admin from './routes/admin.js';
import ai from './routes/ai.js';
import kyc from './routes/kyc.js';
import assistance from './routes/assistance.js';
import plans, { ensurePlans } from './routes/plans.js';

if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET in backend/.env');

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
// cross-origin resource policy lets the separate frontend site display uploaded photos
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40 }));
app.use('/api/ai', rateLimit({ windowMs: 60 * 1000, limit: 15 }));
app.use('/api', auth, market, trade, equipment, me, admin, ai, kyc, assistance, plans);
app.get('/health', (_q, r) => r.json({ ok: true }));

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.name === 'MulterError')
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 4 MB.' : 'Upload problem: ' + err.message });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

await initDb();
await ensureAdmin();
await ensurePlans();
app.listen(process.env.PORT || 4000, () => console.log('AgriConnect API running'));
