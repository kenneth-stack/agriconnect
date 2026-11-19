import { query } from './db.js';

// Placeholder delivery fees (per order). Set your real ones in Admin > Plans & fees.
const DEFAULTS = { delivery_same_state: '2500', delivery_other_state: '8000' };

export async function ensureSettings() {
  for (const [k, v] of Object.entries(DEFAULTS)) await query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
}
export async function getFees() {
  const m = Object.fromEntries((await query("SELECT key, value FROM settings WHERE key LIKE 'delivery_%'")).map((r) => [r.key, Number(r.value)]));
  return { same: m.delivery_same_state ?? 2500, other: m.delivery_other_state ?? 8000 };
}
export const deliveryFee = (fees, sellerState, buyerState, fulfilment) =>
  fulfilment === 'pickup' ? 0 : buyerState === sellerState ? fees.same : fees.other;
