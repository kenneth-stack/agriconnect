import { Router } from 'express';
import { one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';

const r = Router();

/* Orders (trades) */
r.post('/orders', requireAuth('farmer', 'buyer', 'investor'), needKyc, async (req, res) => {
  const { listing_id, quantity, delivery_state, note } = req.body;
  const qty = Number(quantity);
  const l = await one("SELECT * FROM listings WHERE id=$1 AND status='available'", [Number(listing_id) || 0]);
  if (!l) throw new HttpError(404, 'That produce is no longer available.');
  if (l.seller_id === req.user.id) throw new HttpError(400, 'You cannot buy your own produce.');
  if (!(qty > 0) || qty > l.quantity) throw new HttpError(400, `Choose a quantity between 1 and ${l.quantity} ${l.unit}.`);
  const total = qty * l.price;
  const o = await tx(async (q) => {
    const [row] = await q(
      'INSERT INTO orders (listing_id,buyer_id,farmer_id,quantity,total,delivery_state,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [l.id, req.user.id, l.seller_id, qty, total, delivery_state || null, note || null]);
    await logActivity(q, req.user.id, 'placed_order', `Ordered ${qty} ${l.unit} of ${l.title}`);
    await logActivity(q, l.seller_id, 'received_order', `New order for ${qty} ${l.unit} of ${l.title}`);
    return row;
  });
  res.status(201).json({ id: o.id, total });
});

// pending -> confirmed | cancelled ; confirmed -> completed | cancelled
r.patch('/orders/:id/status', requireAuth(), async (req, res) => {
  const next = req.body.status;
  await tx(async (q) => {
    const [o] = await q('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [Number(req.params.id) || 0]);
    if (!o) throw new HttpError(404, 'Order not found.');
    const seller = o.farmer_id === req.user.id || req.user.role === 'admin';
    const buyer = o.buyer_id === req.user.id;
    const ok =
      (o.status === 'pending' && next === 'confirmed' && seller) ||
      (o.status === 'pending' && next === 'cancelled' && (seller || buyer)) ||
      (o.status === 'confirmed' && ['completed', 'cancelled'].includes(next) && seller);
    if (!ok) throw new HttpError(400, 'That change is not allowed for this order.');
    if (next === 'confirmed') {
      const [l] = await q('SELECT quantity FROM listings WHERE id=$1 FOR UPDATE', [o.listing_id]);
      if (l.quantity < o.quantity) throw new HttpError(400, 'Not enough stock left to confirm this order.');
      await q('UPDATE listings SET quantity = quantity - $1 WHERE id=$2', [o.quantity, o.listing_id]);
    }
    if (o.status === 'confirmed' && next === 'cancelled')
      await q('UPDATE listings SET quantity = quantity + $1 WHERE id=$2', [o.quantity, o.listing_id]);
    await q('UPDATE orders SET status=$1, updated_at=now() WHERE id=$2', [next, o.id]);
    const text = `Order #${o.id} ${next}`;
    await logActivity(q, o.buyer_id, `order_${next}`, text);
    await logActivity(q, o.farmer_id, `order_${next}`, text);
  });
  res.json({ ok: true });
});

export default r;
