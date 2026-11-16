import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes.js';

if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET in backend/.env');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use('/api/ai', rateLimit({ windowMs: 60 * 1000, limit: 15 }));
app.use('/api', routes);
app.get('/health', (_q, r) => r.json({ ok: true }));

app.listen(process.env.PORT || 4000, () => console.log('AgriConnect API running'));
