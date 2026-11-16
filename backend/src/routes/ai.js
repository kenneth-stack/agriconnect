import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { HttpError } from '../http.js';

const r = Router();
const LANGS = { en: 'English', yo: 'Yoruba', ig: 'Igbo', ha: 'Hausa', pcm: 'Nigerian Pidgin' };

r.get('/ai/status', (_q, res) => res.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) }));

r.post('/ai/chat', requireAuth(), async (req, res) => {
  const { message, language = 'en', history = [] } = req.body;
  if (!message) throw new HttpError(400, 'Type or speak a question first.');
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'The AI assistant is coming soon.');
  const system = `You are AgriConnect's farm assistant for Nigerian smallholder farmers. Reply in ${LANGS[language] || 'English'}, in short, simple sentences. Cover crop choice, planting and spraying timing, pests and diseases, fertilizer, storage and selling. Never invent prices or weather data; say so if you lack live data. For serious disease or livestock illness, advise contacting a local extension officer or vet.`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 600, system,
      messages: [...history.slice(-10), { role: 'user', content: message }] })
  });
  const data = await resp.json();
  if (!resp.ok) { console.error(data); throw new HttpError(502, 'The assistant is unavailable right now. Try again shortly.'); }
  res.json({ reply: data.content.map((c) => c.text || '').join('') });
});

export default r;
