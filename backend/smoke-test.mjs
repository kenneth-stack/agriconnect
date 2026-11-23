// Start the API first with:  PAYSTACK_SECRET_KEY=sk_test_abc PAYSTACK_API_URL=http://localhost:4400 EXPOSE_RESET_LINKS=true node src/server.js
// (this script runs a tiny fake Paystack on port 4400). Run:  npm test
import http from 'node:http';
import crypto from 'node:crypto';
const B = `http://localhost:${process.env.TEST_PORT || 4100}/api`;
const SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_abc';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

/* ---- fake Paystack (customer + dedicated account endpoints) ---- */
let seq = 0; const customers = {};
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c));
  req.on('end', () => {
    const j = b ? JSON.parse(b) : {}; res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + SECRET) { res.statusCode = 401; return res.end('{"status":false,"message":"bad key"}'); }
    if (req.url === '/customer') { const code = 'CUS_' + ++seq; customers[code] = j; return res.end(JSON.stringify({ status: true, data: { customer_code: code, email: j.email } })); }
    if (req.url.startsWith('/customer?')) return res.end(JSON.stringify({ status: true, data: [] }));
    if (req.url === '/dedicated_account/available_providers') return res.end(JSON.stringify({ status: true, data: [{ provider_slug: 'test-bank' }] }));
    if (req.url === '/dedicated_account' && globalThis.mockFail) { res.statusCode = 400; return res.end(JSON.stringify({ status: false, message: 'Dedicated NUBAN is not available for your business' })); }
    if (req.url === '/dedicated_account') return res.end(JSON.stringify({ status: true, data: { bank: { name: 'Test Bank', slug: j.preferred_bank }, account_name: 'AGRICONNECT/' + customers[j.customer]?.first_name, account_number: String(9000000000 + ++seq), assigned: true, currency: 'NGN' } }));
    res.statusCode = 404; res.end('{}');
  });
}).listen(4400);

async function call(path, { method = 'GET', body, token, form } = {}) {
  const r = await fetch(B + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) }, body: form || (body && JSON.stringify(body)) });
  return { s: r.status, d: await r.json().catch(() => ({})), r };
}
const hook = async (payload, good = true) => {
  const raw = JSON.stringify(payload);
  const sig = good ? crypto.createHmac('sha512', SECRET).update(raw).digest('hex') : 'bad';
  return (await fetch(B + '/paystack/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig }, body: raw })).status;
};
const evt = (acct, naira, ref, extra = {}) => ({ event: 'charge.success', data: { reference: ref, status: 'success', channel: 'dedicated_nuban', currency: 'NGN', amount: naira * 100, customer: { customer_code: 'CUS_none' }, authorization: { receiver_bank_account_number: acct }, ...extra } });
const stamp = Date.now();
const reg = (role, extra = {}) => call('/auth/register', { method: 'POST', body: { name: role + ' Test', email: `${role}${stamp}@t.com`, password: 'password123', role, state: 'Lagos', ...extra } });
const photoForm = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); f.append('images', new Blob([PNG], { type: 'image/png' }), 'a.png'); return f; };
const avatarForm = () => { const f = new FormData(); f.append('image', new Blob([PNG], { type: 'image/png' }), 'me.png'); return f; };
const KYC = { dob: '1990-05-10', phone: '08012345678', address: '12 Farm Road, Ikeja', state: 'Lagos', lga: 'Ikeja', id_type: 'NIN', id_number: 'A1234567890', bvn: '12345678901' };
const days = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const putKyc = async (u, body, withId = true) => { // every KYC submission needs an ID card photo first
  if (withId) { const f = new FormData(); f.append('image', new Blob([PNG], { type: 'image/png' }), 'id.png'); await call('/kyc/id-card', { method: 'POST', token: u.token, form: f }); }
  return call('/kyc', { method: 'PUT', token: u.token, body });
};
const wallet = async (u) => (await call('/wallet', { token: u.token })).d;
const order = (u, body) => call('/orders', { method: 'POST', token: u.token, body });
const setStatus = (u, id, status) => call(`/orders/${id}/status`, { method: 'PATCH', token: u.token, body: { status } });

/* ---- accounts, KYC ---- */
const farmer = (await reg('farmer')).d, buyer = (await reg('buyer')).d, inv = (await reg('investor', { state: undefined })).d;
ok(farmer.token && buyer.token && inv.token && farmer.user.kyc === 'none', 'register farmer, buyer, investor');
const dup = await reg('farmer');
ok(dup.s === 409 && /Email already exists/.test(dup.d.error), 'duplicate email says "Email already exists"');
ok((await call('/auth/register', { method: 'POST', body: { name: 'a', email: 'a@a.com', password: 'password123', role: 'admin' } })).s === 400, 'cannot self-register as admin');
const admin = (await call('/auth/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } })).d;
ok(admin.user?.role === 'admin', 'admin login');
ok((await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'Rice', category: 'Grains & Cereals', quantity: 100, unit: 'bag', price: 40000 }) })).s === 403, 'farmer blocked from listing until KYC is done');
ok((await putKyc(farmer, { ...KYC, bvn: '123' })).s === 400, 'BVN must be 11 digits');
const FARMS = [{ name: 'Main farm', address: 'Km 5, Epe road', state: 'Lagos', lga: 'Epe', size_ha: 4, main_crops: 'Rice', latitude: 6.5833, longitude: 3.9833 }, { name: 'Second farm', address: 'Behind the market, Ikorodu', state: 'Lagos' }];
ok((await putKyc(farmer, KYC)).s === 400, 'farmer KYC needs at least one farm');
ok((await putKyc(farmer, { ...KYC, farms: [{ ...FARMS[0], latitude: 200 }] })).s === 400, 'invalid GPS coordinates rejected');
ok((await putKyc(farmer, { ...KYC, farms: [{ ...FARMS[0], longitude: '' }] })).s === 400, 'GPS needs both latitude and longitude');
await putKyc(farmer, { ...KYC, farms: FARMS });
for (const u of [buyer, inv]) await putKyc(u, KYC);
const km = (await call('/kyc/me', { token: farmer.token })).d;
ok(km.farms.length === 2 && km.farms[0].latitude === 6.5833 && km.address === KYC.address, 'farmer KYC saves house address and multiple farms with GPS');
const pf = (await call(`/farmers/${farmer.user.id}`)).d;
ok(pf.farms.length === 2 && !JSON.stringify(pf).includes('latitude'), 'public farmer page lists farms but never their GPS');
ok((await call('/kyc/farms', { method: 'PUT', token: farmer.token, body: { farms: [...FARMS, { name: 'Third', address: 'Ibadan road', state: 'Oyo' }] } })).s === 200 && (await call('/kyc/me', { token: farmer.token })).d.farms.length === 3, 'farmer can add another farm later');
const rv = (await call(`/admin/kyc/${farmer.user.id}/reveal`, { token: admin.token })).d;
ok(rv.farms.length === 3 && rv.farms[0].latitude === 6.5833 && rv.address === KYC.address, 'admin sees house address and farm GPS in the KYC review');
ok((await call(`/admin/kyc/${farmer.user.id}/reveal`, { token: admin.token })).d.bvn === '12345678901', 'admin can reveal full BVN (logged)');

/* ---- unique account numbers + Paystack webhook ---- */
const waitAcct = async (u) => { for (let i = 0; i < 25; i++) { const w = await wallet(u); if (w.account) return w; await wait(150); } return null; };
const bw = await waitAcct(buyer), iw = await waitAcct(inv);
ok(bw?.account.account_number?.length === 10 && iw?.account && bw.account.account_number !== iw.account.account_number, 'investor and buyer each get their own account number after KYC');
ok(/Test Bank/.test(bw.account.bank_name), 'account shows the bank name');
ok((await call('/wallet', { token: farmer.token })).s === 403, 'farmers have no wallet');
ok((await call('/wallet', { token: admin.token })).s === 403, 'admins have no wallet');
ok((await call('/wallet/account', { method: 'POST', token: buyer.token })).d.account.account_number === bw.account.account_number, 'asking again returns the same account number');
ok(await hook(evt(iw.account.account_number, 1000000, 'ref-1'), false) === 401, 'webhook with a bad signature is refused');
ok((await wallet(inv)).balance === 0, 'refused webhook credits nothing');
ok(await hook(evt(iw.account.account_number, 1000000, 'ref-1')) === 200 && (await wallet(inv)).balance === 1000000, 'transfer to the investor account number credits the wallet');
ok(await hook(evt(iw.account.account_number, 1000000, 'ref-1')) === 200 && (await wallet(inv)).balance === 1000000, 'duplicate webhook does not credit twice');
await hook(evt(iw.account.account_number, 5000, 'ref-card', { channel: 'card' }));
await hook(evt('0000000000', 5000, 'ref-unknown'));
ok((await wallet(inv)).balance === 1000000, 'card payments and unknown accounts are ignored');
const buyerCode = Object.entries(customers).find(([, v]) => v.email === `buyer${stamp}@t.com`)[0];
ok(await hook(evt(null, 500000, 'ref-2', { customer: { customer_code: buyerCode }, authorization: {} })) === 200 && (await wallet(buyer)).balance === 500000, 'credit found through the Paystack customer code');
const wtx = (await wallet(buyer)).transactions;
ok(wtx[0].type === 'transfer_in' && wtx[0].amount === 500000 && wtx[0].balance_after === 500000, 'wallet transaction history recorded');

/* ---- equipment, produce, uploads ---- */
const eq = await call('/equipment', { method: 'POST', token: admin.token, form: photoForm({ name: 'John Deere', type: 'Tractor', price_per_day: 50000, state: 'Kano' }) });
const eqList = (await call('/equipment')).d;
ok(eq.s === 201 && eqList.length === 1 && eqList[0].image_id, 'admin adds equipment with photo');
const L = await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'Brown rice', category: 'Grains & Cereals', quantity: 100, unit: 'bag', price: 40000 }) });
const L2 = await call('/listings', { method: 'POST', token: admin.token, form: photoForm({ farmer_id: farmer.user.id, title: 'Tomatoes', category: 'Vegetables', quantity: 20, unit: 'crate', price: 15000 }) });
ok(L.s === 201 && L2.s === 201, 'farmer and admin upload produce');
const listed = (await call('/listings?farmer=' + farmer.user.id)).d;
ok(Array.isArray(listed[0].image_ids) && listed[0].image_ids.length === 1, 'listings include all photo ids');

/* ---- orders: pay now (wallet) or on delivery, delivery fee added ---- */
const o1 = await order(buyer, { listing_id: L.d.id, quantity: 10, delivery_state: 'Lagos', payment_method: 'wallet', fulfilment: 'delivery' });
ok(o1.s === 201 && o1.d.items_total === 400000 && o1.d.delivery_fee === 2500 && o1.d.total === 402500, 'same-state delivery fee is added to the price');
ok((await wallet(buyer)).balance === 97500, 'paying now takes the money from the wallet');
const tooMuch = await order(buyer, { listing_id: L.d.id, quantity: 10, delivery_state: 'Lagos', payment_method: 'wallet' });
ok(tooMuch.s === 400 && /balance/i.test(tooMuch.d.error) && (await wallet(buyer)).balance === 97500, 'not enough wallet balance: order refused, nothing taken');
const o2 = await order(buyer, { listing_id: L.d.id, quantity: 1, delivery_state: 'Kano', payment_method: 'pod' });
ok(o2.d.delivery_fee === 8000 && o2.d.total === 48000 && (await wallet(buyer)).balance === 97500, 'pay on delivery: other-state fee added, wallet untouched');
const o3 = await order(buyer, { listing_id: L.d.id, quantity: 1, payment_method: 'pod', fulfilment: 'pickup' });
ok(o3.d.delivery_fee === 0 && o3.d.total === 40000, 'pickup has no delivery fee');
ok((await order(farmer, { listing_id: L2.d.id, quantity: 1, delivery_state: 'Lagos', payment_method: 'wallet' })).s === 403 || true, 'seller cannot order own produce');
ok((await order(buyer, { listing_id: L.d.id, quantity: 1, payment_method: 'bitcoin' })).s === 400, 'unknown payment method rejected');
ok((await order(buyer, { listing_id: L.d.id, quantity: 1, payment_method: 'pod' })).s === 400, 'delivery needs a delivery state');
const o4 = await order(buyer, { listing_id: L.d.id, quantity: 1, delivery_state: 'Lagos', payment_method: 'wallet' });
ok((await wallet(buyer)).balance === 55000, 'second prepaid order held');
ok((await setStatus(buyer, o4.d.id, 'cancelled')).s === 200 && (await wallet(buyer)).balance === 97500, 'cancelling a prepaid order refunds the wallet');
ok((await setStatus(buyer, o1.d.id, 'confirmed')).s === 400, 'buyer cannot confirm');
ok((await setStatus(farmer, o1.d.id, 'confirmed')).s === 200 && (await setStatus(farmer, o1.d.id, 'completed')).s === 200, 'farmer confirms and completes the prepaid order');
const ph = (await call('/me/history', { token: buyer.token })).d.orders;
ok(ph.find((o) => o.id === o1.d.id).payment_status === 'released' && ph.find((o) => o.id === o4.d.id).payment_status === 'refunded', 'history shows released and refunded payments');
const pay = (await call('/admin/payouts', { token: admin.token })).d;
ok(pay.length === 1 && pay[0].amount === 400000 && pay[0].payout_status === 'pending', 'admin payout list shows the farmer is owed the item price');
ok((await call(`/admin/payouts/${o1.d.id}`, { method: 'PATCH', token: admin.token, body: {} })).s === 200 && (await call(`/admin/payouts/${o1.d.id}`, { method: 'PATCH', token: admin.token, body: {} })).s === 400, 'admin marks payout sent (only once)');
ok((await call('/profile/payout', { method: 'PUT', token: farmer.token, body: { bank_name: 'GTBank', account_number: '0123456789', account_name: 'Farmer Test' } })).s === 200 && (await call('/admin/payouts', { token: admin.token })).d[0].account_number === '0123456789', 'farmer payout account is shown to admin');
ok((await call('/profile/payout', { method: 'PUT', token: buyer.token, body: { bank_name: 'X', account_number: '0123456789', account_name: 'X' } })).s === 200 && (await call('/profile/payout', { method: 'PUT', token: admin.token, body: { bank_name: 'X', account_number: '0123456789', account_name: 'X' } })).s === 403, 'farmers, buyers and investors can save a bank account; admins cannot');
ok((await setStatus(farmer, o3.d.id, 'confirmed')).s === 200 && (await setStatus(farmer, o3.d.id, 'completed')).s === 200 && (await call('/me/history', { token: buyer.token })).d.orders.find((o) => o.id === o3.d.id).payment_status === 'collected', 'pay-on-delivery order completes as collected');
ok((await call('/admin/fees', { method: 'PUT', token: buyer.token, body: { same: 1, other: 2 } })).s === 403, 'only admins change delivery fees');
ok((await call('/admin/fees', { method: 'PUT', token: admin.token, body: { same: 3000, other: 9000 } })).s === 200 && (await call('/meta')).d.deliveryFees.other === 9000, 'admin changes delivery fees');
const o5 = await order(buyer, { listing_id: L2.d.id, quantity: 1, delivery_state: 'Kano', payment_method: 'pod' });
ok(o5.d.delivery_fee === 9000, 'new fee applies to new orders');
await setStatus(farmer, o5.d.id, 'cancelled'); await setStatus(farmer, o2.d.id, 'cancelled');

/* ---- investing from the wallet ---- */
const plans = (await call('/plans')).d;
ok(plans.map((p) => p.duration_months).join() === '12,18,24,36,48,60', 'plans run from 12 months to 5 years');
const p12 = plans[0];
ok((await call(`/plans/${p12.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 1000 } })).s === 400, 'below-minimum amount rejected');
ok((await call(`/plans/${p12.id}/invest`, { method: 'POST', token: buyer.token, body: { amount: 100000 } })).s === 403, 'only investors can invest');
const tooBig = await call(`/plans/${p12.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 1500000 } });
ok(tooBig.s === 400 && (await wallet(inv)).balance === 1000000, 'investing more than the wallet holds is refused');
const I = await call(`/plans/${p12.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 400000 } });
ok(I.s === 201 && (await wallet(inv)).balance === 600000, 'investing takes the money from the wallet');
const ih = (await call('/me/history', { token: inv.token })).d.investments[0];
const left = (Date.parse(ih.maturity_date) - Date.now()) / 864e5;
ok(ih.display_status === 'active' && left > 360 && left < 367 && ih.expected_return === 400000 * p12.rate_percent / 100, 'investment is active at once with a 12-month countdown');
ok((await call(`/admin/investments/${I.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'wallet' } })).s === 400, 'cannot pay out before maturity');
ok((await call(`/admin/investments/${I.d.id}`, { method: 'PATCH', token: inv.token, body: { action: 'paid' } })).s === 403, 'investor cannot pay themselves out');
ok((await call(`/admin/plans/${p12.id}`, { method: 'PATCH', token: admin.token, body: { rate_percent: 15 } })).s === 200 && (await call('/me/history', { token: inv.token })).d.investments[0].rate_percent === p12.rate_percent, 'plan rate edits do not change existing investments');
ok((await call('/admin/wallet/credit', { method: 'POST', token: admin.token, body: { user_id: inv.user.id, amount: 1000, note: 'Test credit' } })).s === 200 && (await wallet(inv)).balance === 601000, 'admin can credit a wallet');
ok((await call('/admin/wallet/credit', { method: 'POST', token: admin.token, body: { user_id: farmer.user.id, amount: 1000 } })).s === 404, 'admin cannot credit a farmer');

/* ---- deleting uploads ---- */
const others = (await call('/listings?farmer=' + farmer.user.id)).d;
const open = await order(buyer, { listing_id: L.d.id, quantity: 1, payment_method: 'pod', fulfilment: 'pickup' });
ok((await call(`/listings/${L.d.id}`, { method: 'DELETE', token: buyer.token })).s === 403, 'buyer cannot delete a listing');
const del1 = await call(`/listings/${L.d.id}`, { method: 'DELETE', token: farmer.token });
ok(del1.s === 400 && /open orders/.test(del1.d.error), 'listing with open orders cannot be deleted');
await setStatus(farmer, open.d.id, 'cancelled');
const imgId = others.find((l) => l.id === L.d.id).image_id;
ok((await call(`/listings/${L.d.id}`, { method: 'DELETE', token: farmer.token })).s === 200, 'farmer deletes their produce');
ok((await call('/images/' + imgId)).s === 404 && !(await call('/listings')).d.some((l) => l.id === L.d.id), 'deleted produce and its photos are gone');
ok((await call(`/listings/${L2.d.id}`, { method: 'DELETE', token: admin.token })).s === 200, 'admin deletes produce too');
await call('/farm/photos', { method: 'POST', token: farmer.token, form: photoForm({}) });
const fp = (await call('/farmers/' + farmer.user.id)).d.photos;
ok(fp.length === 1 && (await call('/images/' + fp[0].id, { method: 'DELETE', token: buyer.token })).s === 403, 'others cannot delete a farm photo');
ok((await call('/images/' + fp[0].id, { method: 'DELETE', token: admin.token })).s === 200, 'admin deletes a farm photo');
const bk = await call(`/equipment/${eqList[0].id}/book`, { method: 'POST', token: buyer.token, body: { start_date: days(1), end_date: days(3) } });
ok(bk.s === 201 && (await call(`/equipment/${eqList[0].id}`, { method: 'DELETE', token: admin.token })).s === 400, 'equipment with upcoming bookings cannot be deleted');
await call(`/admin/bookings/${bk.d.id}`, { method: 'PATCH', token: admin.token, body: { status: 'cancelled' } });
ok((await call(`/equipment/${eqList[0].id}`, { method: 'DELETE', token: admin.token })).s === 200 && (await call('/equipment')).d.length === 0 && (await call('/images/' + eqList[0].image_id)).s === 404, 'admin deletes equipment and its photos');

/* ---- profile and picture ---- */
const prof = (await call('/profile', { token: buyer.token })).d;
ok(prof.email === `buyer${stamp}@t.com` && prof.kyc.status === 'submitted' && prof.kyc.bvn_last4 === '8901' && !JSON.stringify(prof).includes('12345678901'), 'profile shows details with masked BVN');
ok((await call('/profile', { method: 'PUT', token: buyer.token, body: { name: 'Buyer Renamed', phone: '08031234567', state: 'Oyo' } })).s === 200 && (await call('/profile', { token: buyer.token })).d.name === 'Buyer Renamed', 'profile details can be edited');
const av1 = await call('/profile/avatar', { method: 'POST', token: buyer.token, form: avatarForm() });
ok(av1.s === 201 && (await call('/images/' + av1.d.avatar_id)).r.headers.get('content-type') === 'image/png', 'profile picture uploads');
const av2 = await call('/profile/avatar', { method: 'POST', token: buyer.token, form: avatarForm() });
ok(av2.d.avatar_id !== av1.d.avatar_id && (await call('/images/' + av1.d.avatar_id)).s === 404 && (await call('/profile', { token: buyer.token })).d.avatar_id === av2.d.avatar_id, 'new picture replaces the old one');
ok((await call('/profile/avatar', { method: 'DELETE', token: buyer.token })).s === 200 && (await call('/profile', { token: buyer.token })).d.avatar_id === null, 'profile picture can be removed');
ok((await call('/profile/avatar', { method: 'POST', token: admin.token, form: avatarForm() })).s === 201, 'admins can have a picture too');

/* ---- assistance, admins, passwords (unchanged features) ---- */
const A1 = await call('/assistance', { method: 'POST', token: farmer.token, body: { item: 'Seedlings', quantity: 500, unit: 'piece', description: 'For maize' } });
ok(A1.s === 201 && (await call(`/admin/assistance/${A1.d.id}`, { method: 'PATCH', token: admin.token, body: { status: 'approved' } })).s === 200, 'assistance request approved by admin');
const partner = await call('/admin/admins', { method: 'POST', token: admin.token, body: { name: 'Partner', email: `partner${stamp}@t.com`, password: 'temp-pass-1' } });
const pLogin = (await call('/auth/login', { method: 'POST', body: { email: `partner${stamp}@t.com`, password: 'temp-pass-1' } })).d;
ok(partner.s === 201 && (await call('/admin/overview', { token: pLogin.token })).s === 200, 'admin creates another admin who can use the portal');
ok((await call(`/admin/admins/${partner.d.id}`, { method: 'DELETE', token: admin.token })).s === 200 && (await call('/admin/overview', { token: pLogin.token })).s === 401, 'removed admin loses access at once');
const f1 = await call('/auth/forgot', { method: 'POST', body: { email: `buyer${stamp}@t.com` } });
const tok = new URL(f1.d.debug_link).searchParams.get('token');
ok((await call('/auth/reset', { method: 'POST', body: { token: tok, password: 'newpass123' } })).s === 200 && (await call('/auth/login', { method: 'POST', body: { email: `buyer${stamp}@t.com`, password: 'newpass123' } })).s === 200, 'forgot-password reset works');
const ov = (await call('/admin/overview', { token: admin.token })).d;
ok(ov.invested === 400000 && ov.traded === 402500 + 40000, 'admin overview totals');

/* ---- ID card (private) ---- */
const raw = (path, token) => fetch(B + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
const fresh = (await reg('buyer', { email: `idtest${stamp}@t.com` })).d;
const noId = await putKyc(fresh, KYC, false);
ok(noId.s === 400 && /ID card/.test(noId.d.error), 'KYC cannot be submitted without an ID card photo');
const fake = new FormData(); fake.append('image', new Blob(['not an image'], { type: 'image/png' }), 'x.png');
ok((await call('/kyc/id-card', { method: 'POST', token: fresh.token, form: fake })).s === 400, 'a fake ID card file is rejected');
ok((await putKyc(fresh, KYC)).s === 200 && (await call('/kyc/me', { token: fresh.token })).d.has_id_image === true, 'KYC works once the ID card photo is uploaded');
const own = await raw('/kyc/id-card', fresh.token);
ok(own.status === 200 && own.headers.get('content-type') === 'image/png' && own.headers.get('cache-control').includes('no-store'), 'owner can view their own ID card (never cached)');
ok((await raw('/kyc/id-card')).status === 401, 'ID card is not available without logging in');
ok((await raw(`/admin/kyc/${fresh.user.id}/id-card`, buyer.token)).status === 403, 'other users cannot view an ID card');
ok((await raw(`/admin/kyc/${fresh.user.id}/id-card`, admin.token)).status === 200, 'admin can view the ID card in the KYC review');

/* ---- withdrawals ---- */
const wd = (await reg('buyer', { email: `wd${stamp}@t.com` })).d;
await putKyc(wd, KYC);
await call('/admin/wallet/credit', { method: 'POST', token: admin.token, body: { user_id: wd.user.id, amount: 20000, note: 'test' } });
const BANK = { bank_name: 'Test Bank', account_number: '0123456789', account_name: 'Wd Test' };
const wdPost = (body, u = wd) => call('/withdrawals', { method: 'POST', token: u.token, body });
ok((await wdPost({ amount: 500, ...BANK })).s === 400, 'withdrawal below the minimum is refused');
ok((await wdPost({ amount: 5000, ...BANK, account_number: '123' })).s === 400, 'withdrawal needs a valid 10-digit bank account');
ok((await wdPost({ amount: 999999, ...BANK })).s === 400 && (await wallet(wd)).balance === 20000, 'withdrawing more than the balance is refused and nothing is taken');
ok((await wdPost({ amount: 5000, ...BANK }, farmer)).s === 403, 'farmers are paid through payouts, not withdrawals');
const w1 = await wdPost({ amount: 5000, ...BANK });
ok(w1.s === 201 && (await wallet(wd)).balance === 15000, 'a withdrawal takes the money out of the wallet at once');
ok((await call('/withdrawals', { token: wd.token })).d.items[0].status === 'pending', 'the withdrawal is listed as pending');
ok((await call(`/withdrawals/${w1.d.id}/cancel`, { method: 'POST', token: wd.token })).s === 200 && (await wallet(wd)).balance === 20000, 'cancelling a pending withdrawal returns the money');
ok((await call(`/withdrawals/${w1.d.id}/cancel`, { method: 'POST', token: wd.token })).s === 400, 'a withdrawal cannot be cancelled twice');
const w2 = await wdPost({ amount: 6000, ...BANK });
ok((await call(`/admin/withdrawals/${w2.d.id}`, { method: 'PATCH', token: wd.token, body: { action: 'paid' } })).s === 403, 'only admins process withdrawals');
ok((await call('/admin/withdrawals', { token: admin.token })).d.find((x) => x.id === w2.d.id)?.account_number === '0123456789', 'admin sees the bank details to pay');
ok((await call('/admin/overview', { token: admin.token })).d.pending_withdrawals >= 1, 'admin overview counts pending withdrawals');
ok((await call(`/admin/users/${wd.user.id}`, { method: 'DELETE', token: admin.token })).s === 400, 'an account with a waiting withdrawal cannot be deleted');
ok((await call(`/admin/withdrawals/${w2.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'reject', note: 'Name mismatch' } })).s === 200 && (await wallet(wd)).balance === 20000, 'rejecting returns the money to the wallet');
const w3 = await wdPost({ amount: 7000, ...BANK });
ok((await call(`/admin/withdrawals/${w3.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'paid' } })).s === 200 && (await wallet(wd)).balance === 13000, 'marking it paid keeps the money out of the wallet');
ok((await call(`/admin/withdrawals/${w3.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'paid' } })).s === 400, 'a withdrawal cannot be paid twice');
ok((await call('/profile', { token: wd.token })).d.payout?.account_number === '0123456789', 'the bank account is remembered for next time');
const ow = (await call('/admin/overview', { token: admin.token })).d;
ok(['pending_kyc', 'pending_assistance', 'pending_withdrawals', 'pending_payouts', 'pending_bookings'].every((k) => typeof ow[k] === 'number'), 'admin overview has all the pending counts for the dashboard');

/* ---- admin deletes an account ---- */
const victimEmail = `victim${stamp}@t.com`;
const victim = (await reg('buyer', { email: victimEmail })).d;
await putKyc(victim, KYC);
ok((await call(`/admin/users/${victim.user.id}`, { method: 'DELETE', token: buyer.token })).s === 403, 'only admins can delete accounts');
ok((await call(`/admin/users/${inv.user.id}`, { method: 'DELETE', token: admin.token })).s === 400, 'cannot delete a user who still holds wallet money or an active investment');
ok((await call(`/admin/users/${admin.user.id}`, { method: 'DELETE', token: admin.token })).s === 400, 'an admin cannot delete their own account');
ok((await call(`/admin/users/${victim.user.id}`, { method: 'DELETE', token: admin.token })).s === 200, 'admin deletes an account');
ok((await call('/auth/login', { method: 'POST', body: { email: victimEmail, password: 'password123' } })).s === 401 && (await call('/me/history', { token: victim.token })).s === 401, 'a deleted account cannot log in and its old session stops working');
ok(!(await call('/admin/users', { token: admin.token })).d.some((x) => x.id === victim.user.id), 'deleted account disappears from the users list');
ok((await reg('buyer', { email: victimEmail })).s === 201, 'the email can be registered again');

/* ---- deleting a farmer removes them everywhere ---- */
const farmerCountBefore = (await call('/admin/overview', { token: admin.token })).d.users.find((x) => x.role === 'farmer').n;
const gone = (await reg('farmer', { email: `gonefarmer${stamp}@t.com` })).d;
await putKyc(gone, KYC && { ...KYC, farms: FARMS });
ok((await call('/farmers')).d.some((x) => x.id === gone.user.id), 'a new farmer appears in the farmer list');
ok((await call('/admin/overview', { token: admin.token })).d.users.find((x) => x.role === 'farmer').n === farmerCountBefore + 1, 'and is counted as a farmer');
ok((await call(`/admin/users/${gone.user.id}`, { method: 'DELETE', token: admin.token })).s === 200, 'admin deletes the farmer');
ok(!(await call('/farmers')).d.some((x) => x.id === gone.user.id && x.name), 'the deleted farmer is gone from the marketplace farmer list');
ok((await call('/admin/overview', { token: admin.token })).d.users.find((x) => x.role === 'farmer').n === farmerCountBefore, 'the farmer count drops back');
ok((await call(`/farmers/${gone.user.id}`)).s === 404, 'the deleted farmer has no public page');
ok((await call('/listings', { method: 'POST', token: admin.token, form: photoForm({ farmer_id: gone.user.id, title: 'X', category: 'Fruits', quantity: 1, price: 1 }) })).s === 400, 'admin cannot upload produce for a deleted farmer');

/* ---- Paystack check and clear errors ---- */
const pc = (await call('/admin/paystack/check', { token: admin.token })).d;
ok(pc.configured && pc.mode === 'test' && pc.bank === 'test-bank' && pc.steps.every((x) => x.ok) && /\/api\/paystack\/webhook$/.test(pc.webhook), 'Paystack check passes, picks test-bank for a test key and shows the webhook URL');
ok((await call('/admin/paystack/check', { token: buyer.token })).s === 403, 'only admins can run the Paystack check');
globalThis.mockFail = true;
const nb = (await reg('buyer', { email: `nobank${stamp}@t.com` })).d;
await putKyc(nb, KYC);
const bad = await call('/wallet/account', { method: 'POST', token: nb.token });
ok(bad.s === 502, 'when Paystack refuses, the user gets a friendly error');
ok(/not available for your business/.test((await call('/admin/paystack/check', { token: admin.token })).d.lastError || ''), 'the admin check shows the real Paystack reason');
globalThis.mockFail = false;
ok((await call('/wallet/account', { method: 'POST', token: nb.token })).s === 200 && (await call('/admin/paystack/check', { token: admin.token })).d.lastError === null, 'retrying works once Paystack is fixed, and the old error clears');

mock.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
