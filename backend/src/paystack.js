// Paystack: a personal bank account number for each investor and buyer (Dedicated Virtual Account).
import crypto from 'node:crypto';

export const paystackEnabled = () => Boolean(process.env.PAYSTACK_SECRET_KEY);
const base = () => process.env.PAYSTACK_API_URL || 'https://api.paystack.co';

async function ps(path, { method = 'GET', body } = {}) {
  const res = await fetch(base() + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) throw new Error(data.message || `Paystack error ${res.status}`);
  return data;
}

export async function createDedicatedAccount({ email, name, phone }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  let code;
  try {
    code = (await ps('/customer', { method: 'POST', body: { email, first_name: first, last_name: rest.join(' ') || first, phone } })).data.customer_code;
  } catch {
    code = (await ps(`/customer/${encodeURIComponent(email)}`)).data.customer_code; // customer already exists
  }
  const d = (await ps('/dedicated_account', { method: 'POST', body: { customer: code, preferred_bank: process.env.PAYSTACK_DVA_BANK || 'wema-bank' } })).data || {};
  return { code, account_number: d.account_number || null, account_name: d.account_name || null, bank_name: d.bank?.name || null };
}

// Paystack signs every webhook with your secret key
export function verifySignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
