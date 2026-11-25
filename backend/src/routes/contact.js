import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from '../http.js';
import { sendContactMessage } from '../mailer.js';

const r = Router();
const clean = (s, max) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

// Public. Rate limited in server.js. The message is saved first, so nothing is lost if email is down.
r.post('/contact', async (req, res) => {
  if (req.body.website) return res.json({ ok: true }); // hidden field that only bots fill in
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase(), subject = clean(req.body.subject, 120) || 'Message from the website';
  const message = String(req.body.message || '').trim().slice(0, 3000);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address so we can reply.');
  if (message.length < 10) throw new HttpError(400, 'Please write a little more so we can help.');
  const emailed = await sendContactMessage({ name, email, subject, message }).catch(() => false);
  await query('INSERT INTO contact_messages (name, email, subject, message, emailed) VALUES ($1,$2,$3,$4,$5)', [name, email, subject, message, emailed]);
  res.json({ ok: true });
});

export default r;
