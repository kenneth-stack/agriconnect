// Paystack: a personal bank account number for each investor and buyer (Dedicated Virtual Account).
import crypto from 'node:crypto';

const key = () => (process.env.PAYSTACK_SECRET_KEY || '').trim().replace(/^["']|["']$/g, ''); // forgive stray spaces or quotes
export const paystackEnabled = () => Boolean(key());
export const paystackMode = () => (key().startsWith('sk_test_') ? 'test' : key().startsWith('sk_live_') ? 'live' : 'unknown');
// In test mode Paystack only offers "test-bank"; live accounts use wema-bank or titan-paystack.
export const dvaBank = () => (paystackMode() === 'test' ? 'test-bank' : process.env.PAYSTACK_DVA_BANK || 'wema-bank');
const base = () => process.env.PAYSTACK_API_URL || 'https://api.paystack.co';

async function ps(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(base() + path, { method, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  } catch (e) { throw new Error(`Could not reach Paystack (${e.cause?.code || e.message})`); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) throw new Error(data.message || `Paystack error ${res.status}`);
  return data;
}

// 0801 234 5678 -> +2348012345678 (Paystack is happiest with the country code)
export function normalizePhone(p = '') {
  const d = String(p).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (/^0\d{10}$/.test(d)) return '+234' + d.slice(1);
  if (/^234\d{10}$/.test(d)) return '+' + d;
  return d;
}

export async function createDedicatedAccount({ email, name, phone }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  let code;
  try {
    code = (await ps('/customer', { method: 'POST', body: { email, first_name: first, last_name: rest.join(' ') || first, phone: normalizePhone(phone) } })).data.customer_code;
  } catch (firstError) {
    try { code = (await ps(`/customer/${encodeURIComponent(email)}`)).data.customer_code; } // customer may already exist
    catch { throw firstError; } // otherwise report the real reason, not the fallback's
  }
  const d = (await ps('/dedicated_account', { method: 'POST', body: { customer: code, preferred_bank: dvaBank() } })).data || {};
  return { code, account_number: d.account_number || null, account_name: d.account_name || null, bank_name: d.bank?.name || null };
}

// Plain-words health check of the Paystack setup, shown to admins
export async function diagnose() {
  const steps = [], add = (ok, text) => steps.push({ ok, text });
  const info = { configured: paystackEnabled(), mode: paystackMode(), bank: dvaBank(), steps };
  if (!info.configured) { add(false, 'PAYSTACK_SECRET_KEY is not set on the API service.'); return info; }
  if (info.mode === 'unknown') add(false, 'The key does not start with sk_test_ or sk_live_. Paste the SECRET key (not the public key), without quotes or spaces.');
  else add(true, `Using a ${info.mode.toUpperCase()} secret key.`);
  try { await ps('/customer?perPage=1'); add(true, 'Paystack accepted the key.'); }
  catch (e) { add(false, `Paystack did not accept the request: ${e.message}`); return info; }
  try {
    const p = await ps('/dedicated_account/available_providers');
    const slugs = (p.data || []).map((x) => x.provider_slug || x.slug).filter(Boolean);
    add(true, `Dedicated accounts are switched on. Banks available: ${slugs.join(', ') || 'none listed'}.`);
    if (slugs.length && !slugs.includes(info.bank)) add(false, `The bank "${info.bank}" is not in that list. Set PAYSTACK_DVA_BANK to one of them.`);
    else add(true, `Account numbers will be created with "${info.bank}".`);
  } catch (e) { add(false, `Dedicated accounts check failed: ${e.message}. If it says the feature is not available, ask Paystack to enable Dedicated Accounts for your business.`); }
  return info;
}

// Paystack signs every webhook with your secret key
export function verifySignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = crypto.createHmac('sha512', key()).update(rawBody).digest('hex');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
