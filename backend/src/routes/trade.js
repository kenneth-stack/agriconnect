import { Router } from 'express';
import { one, tx, logActivity } from '../db.js';
import { requireAuth, needKyc } from '../auth.js';
import { HttpError } from '../http.js';
import { STATES } from '../meta.js';
import { moveMoney } from '../wallet.js';
import { getFees, deliveryFee } from '../settings.js';

const r = Router();
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');

// Pay now from the wallet (money is held until delivery) or pay on delivery. The delivery fee is added to the produce price.
r.post('/orders', requireAuth('farmer', 'buyer', 'investor'), needKyc, async (req, res) => {
  const { listing_id, quantity, fulfilment = 'delivery', delivery_state, payment_method = 'pod', note } = req.body;
  const qty = Number(quantity);
  if (!['wallet', 'pod'].includes(payment_method)) throw new HttpError(400, 'Choose how you want to pay.');
  if (!['delivery', 'pickup'].includes(fulfilment)) throw new HttpError(400, 'Choose delivery or pickup.');
  if (fulfilment === 'delivery' && !STATES.includes(delivery_state)) throw new HttpError(400, 'Choose the state to deliver to.');
  if (payment_method === 'wallet' && !['buyer', 'investor'].includes(req.user.role)) throw new HttpError(403, 'Wallet payment is for buyer and investor accounts.');
  const l = await one(`SELECT l.*, u.state AS farmer_state FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.id=$1 AND l.status='available'`, [Number(listing_id) || 0]);
  if (!l) throw new HttpError(404, 'That produce is no longer available.');
  if (l.seller_id === req.user.id) throw new HttpError(400, 'You cannot buy your own produce.');
  if (!(qty > 0) || qty > l.quantity) throw new HttpError(400, `Choose a quantity between 1 and ${l.quantity} ${l.unit}.`);
  const items = Math.round(qty * l.price * 100) / 100;
  const fee = deliveryFee(await getFees(), l.farmer_state, delivery_state, fulfilment);
  const total = items + fee;
  const row = await tx(async (q) => {
    if (payment_method === 'wallet') await moveMoney(q, req.user.id, -total, 'order_payment', `Order for ${qty} ${l.unit} of ${l.title} (incl. ${naira(fee)} delivery)`);
    const [o] = await q(`INSERT INTO orders (listing_id,buyer_id,farmer_id,quantity,items_total,delivery_fee,total,fulfilment,delivery_state,note,payment_method,payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [l.id, req.user.id, l.seller_id, qty, items, fee, total, fulfilment, delivery_state || null, (note || '').trim() || null, payment_method, payment_method === 'wallet' ? 'held' : 'pay_on_delivery']);
    await logActivity(q, req.user.id, 'placed_order', `Ordered ${qty} ${l.unit} of ${l.title}: ${naira(total)} (${payment_method === 'wallet' ? 'paid from wallet' : 'pay on delivery'})`);
    await logActivity(q, l.seller_id, 'received_order', `New order for ${qty} ${l.unit} of ${l.title}`);
    return o;
  });
  res.status(201).json({ id: row.id, items_total: items, delivery_fee: fee, total });
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
    let pay = o.payment_status, payout = o.payout_status;
    if (next === 'confirmed') {
      const [l] = await q('SELECT quantity FROM listings WHERE id=$1 FOR UPDATE', [o.listing_id]);
      if (l.quantity < o.quantity) throw new HttpError(400, 'Not enough stock left to confirm this order.');
      await q('UPDATE listings SET quantity = quantity - $1 WHERE id=$2', [o.quantity, o.listing_id]);
    }
    if (o.status === 'confirmed' && next === 'cancelled') await q('UPDATE listings SET quantity = quantity + $1 WHERE id=$2', [o.quantity, o.listing_id]);
    if (next === 'cancelled' && pay === 'held') { // give the buyer their money back
      await moveMoney(q, o.buyer_id, o.total, 'refund', `Refund for order #${o.id}`, `refund:order:${o.id}`);
      pay = 'refunded';
    }
    if (next === 'completed') {
      if (pay === 'held') { pay = 'released'; payout = 'pending'; } // the farmer is now owed the produce price; the admin pays them out
      else pay = 'collected'; // cash collected on delivery
    }
    await q('UPDATE orders SET status=$1, payment_status=$2, payout_status=$3, updated_at=now() WHERE id=$4', [next, pay, payout, o.id]);
    await logActivity(q, o.buyer_id, `order_${next}`, `Order #${o.id} ${next}`);
    await logActivity(q, o.farmer_id, `order_${next}`, `Order #${o.id} ${next}`);
  });
  res.json({ ok: true });
});

export default r;
