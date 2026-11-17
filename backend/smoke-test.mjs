// Run with the API started (EXPOSE_RESET_LINKS=true) on TEST_PORT (default 4100):  npm test
const B = `http://localhost:${process.env.TEST_PORT || 4100}/api`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function call(path, { method = 'GET', body, token, form } = {}) {
  const r = await fetch(B + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) }, body: form || (body && JSON.stringify(body)) });
  return { s: r.status, d: await r.json().catch(() => ({})), r };
}
const stamp = Date.now();
const reg = (role, extra = {}) => call('/auth/register', { method: 'POST', body: { name: role + ' Test', email: `${role}${stamp}@t.com`, password: 'password123', role, state: 'Lagos', ...extra } });
const photoForm = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); f.append('images', new Blob([PNG], { type: 'image/png' }), 'a.png'); return f; };
const KYC = { dob: '1990-05-10', phone: '08012345678', address: '12 Farm Road, Ikeja', state: 'Lagos', lga: 'Ikeja', id_type: 'NIN', id_number: 'A1234567890', bvn: '12345678901' };
const days = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* ---- accounts ---- */
const farmer = (await reg('farmer')).d, buyer = (await reg('buyer')).d, inv = (await reg('investor', { state: undefined })).d;
ok(farmer.token && buyer.token && inv.token && farmer.user.kyc === 'none', 'register farmer, buyer, investor (kyc starts as none)');
const dup = await reg('farmer');
ok(dup.s === 409 && /Email already exists/.test(dup.d.error), 'duplicate email says "Email already exists"');
ok((await call('/auth/register', { method: 'POST', body: { name: 'X', email: `FARMER${stamp}@T.COM`, password: 'password123', role: 'buyer', state: 'Lagos' } })).s === 409, 'duplicate email rejected in another category and with different letter case');
ok((await call('/auth/register', { method: 'POST', body: { name: 'a', email: 'a@a.com', password: 'password123', role: 'admin' } })).s === 400, 'cannot self-register as admin');
const admin = (await call('/auth/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } })).d;
ok(admin.user?.role === 'admin', 'admin login');

/* ---- KYC gate ---- */
const gated = await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'Rice', category: 'Grains & Cereals', quantity: 100, unit: 'bag', price: 40000 }) });
ok(gated.s === 403 && /KYC/.test(gated.d.error), 'farmer blocked from listing until KYC is done');
ok((await call('/orders', { method: 'POST', token: buyer.token, body: { listing_id: 1, quantity: 1 } })).s === 403, 'buyer blocked from ordering until KYC is done');
ok((await call('/kyc', { method: 'PUT', token: farmer.token, body: { ...KYC, bvn: '123' } })).s === 400, 'BVN must be 11 digits');
ok((await call('/kyc', { method: 'PUT', token: farmer.token, body: { ...KYC, dob: days(-365 * 10) } })).s === 400, 'under-18 rejected');
ok((await call('/kyc', { method: 'PUT', token: farmer.token, body: { ...KYC, id_type: 'Library card' } })).s === 400, 'invalid ID type rejected');
ok((await call('/kyc', { method: 'PUT', token: admin.token, body: KYC })).s === 403, 'admins do not file KYC');
for (const u of [farmer, buyer, inv]) await call('/kyc', { method: 'PUT', token: u.token, body: KYC });
const mine = (await call('/kyc/me', { token: farmer.token })).d;
ok(mine.status === 'submitted' && mine.bvn_last4 === '8901' && !JSON.stringify(mine).includes('12345678901'), 'KYC saved; full BVN never returned to the user');
ok((await call('/auth/login', { method: 'POST', body: { email: `farmer${stamp}@t.com`, password: 'password123' } })).d.user.kyc === 'submitted', 'login reports kyc status');
const kycList = (await call('/admin/kyc', { token: admin.token })).d;
ok(kycList.length === 3 && kycList.every((k) => k.bvn_last4 === '8901'), 'admin sees KYC list with masked BVN');
ok((await call(`/admin/kyc/${farmer.user.id}/reveal`, { token: admin.token })).d.bvn === '12345678901', 'admin can reveal full BVN (logged)');
ok((await call(`/admin/kyc/${farmer.user.id}/reveal`, { token: buyer.token })).s === 403, 'non-admin cannot reveal BVN');
ok((await call(`/admin/kyc/${buyer.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'rejected', note: 'Blurry ID' } })).s === 200, 'admin rejects a KYC');
ok((await call('/orders', { method: 'POST', token: buyer.token, body: { listing_id: 1, quantity: 1 } })).s === 403, 'rejected KYC blocks actions again');
await call('/kyc', { method: 'PUT', token: buyer.token, body: KYC });
ok((await call(`/admin/kyc/${farmer.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'verified' } })).s === 200, 'admin verifies farmer KYC');
ok((await call('/kyc', { method: 'PUT', token: farmer.token, body: KYC })).s === 400, 'verified profile cannot be edited');

/* ---- equipment, produce, location, orders (as before) ---- */
ok((await call('/equipment', { method: 'POST', token: farmer.token, form: photoForm({ name: 'T', type: 'Tractor', price_per_day: 5000 }) })).s === 403, 'farmer cannot add equipment');
const eq = await call('/equipment', { method: 'POST', token: admin.token, form: photoForm({ name: 'John Deere', type: 'Tractor', price_per_day: 50000, state: 'Kano' }) });
const eqList = (await call('/equipment')).d;
ok(eq.s === 201 && eqList.length === 1 && eqList[0].image_id, 'admin adds equipment with photo');
const L = await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'Brown rice', category: 'Grains & Cereals', quantity: 100, unit: 'bag', price: 40000 }) });
ok(L.s === 201, 'farmer uploads produce after KYC');
ok((await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'X', category: 'Bogus', quantity: 1, price: 1 }) })).s === 400, 'bad category rejected');
const L2 = await call('/listings', { method: 'POST', token: admin.token, form: photoForm({ farmer_id: farmer.user.id, title: 'Tomatoes', category: 'Vegetables', quantity: 20, unit: 'crate', price: 15000 }) });
ok(L2.s === 201, 'admin uploads produce on behalf of farmer');
ok((await call('/listings?state=Lagos')).d.length === 2 && (await call('/listings?state=Kano')).d.length === 0, 'filter produce by farmer state');
const sum = (await call('/listings/summary')).d;
ok(sum.find((c) => c.category === 'Vegetables').count === 1 && sum.length === 10, 'home summary groups by category');
const o = await call('/orders', { method: 'POST', token: buyer.token, body: { listing_id: L.d.id, quantity: 10, delivery_state: 'Lagos' } });
ok(o.s === 201 && o.d.total === 400000, 'buyer places order');
ok((await call(`/orders/${o.d.id}/status`, { method: 'PATCH', token: farmer.token, body: { status: 'confirmed' } })).s === 200, 'farmer confirms order');
ok((await call(`/orders/${o.d.id}/status`, { method: 'PATCH', token: farmer.token, body: { status: 'completed' } })).s === 200, 'trade completed');
ok((await call('/me/history', { token: buyer.token })).d.orders[0].status === 'completed', 'buyer history shows completed trade');
const bk = await call(`/equipment/${eqList[0].id}/book`, { method: 'POST', token: buyer.token, body: { start_date: days(1), end_date: days(3) } });
ok(bk.s === 201 && (await call(`/equipment/${eqList[0].id}/book`, { method: 'POST', token: farmer.token, body: { start_date: days(1), end_date: days(1) } })).s === 409, 'equipment booked; double booking blocked');

/* ---- assistance / funding ---- */
const meta = (await call('/meta')).d;
ok(meta.assistanceItems.includes('Seedlings') && meta.assistanceItems.includes('Land') && meta.assistanceItems.includes('Manure / organic fertilizer'), 'assistance dropdown options provided');
const A1 = await call('/assistance', { method: 'POST', token: farmer.token, body: { item: 'Manure / organic fertilizer', quantity: 40, unit: 'bag', description: 'For 2 hectares of maize' } });
const A2 = await call('/assistance', { method: 'POST', token: farmer.token, body: { item: 'Seedlings', quantity: 500, unit: 'piece' } });
ok(A1.s === 201 && A2.s === 201, 'farmer submits assistance requests');
ok((await call('/assistance', { method: 'POST', token: farmer.token, body: { item: 'Gold bars', quantity: 1, unit: 'kg' } })).s === 400, 'unknown assistance item rejected');
ok((await call('/assistance', { method: 'POST', token: buyer.token, body: { item: 'Seeds', quantity: 1, unit: 'kg' } })).s === 403, 'only farmers can request assistance');
ok((await call('/admin/assistance', { token: admin.token })).d.filter((a) => a.status === 'pending').length === 2, 'admin sees pending applications');
ok((await call('/admin/assistance', { token: farmer.token })).s === 403, 'farmer cannot see admin applications');
ok((await call(`/admin/assistance/${A1.d.id}`, { method: 'PATCH', token: admin.token, body: { status: 'approved', note: 'Collect at depot' } })).s === 200, 'admin approves');
ok((await call(`/admin/assistance/${A2.d.id}`, { method: 'PATCH', token: admin.token, body: { status: 'rejected', note: 'Out of stock' } })).s === 200, 'admin rejects');
ok((await call(`/admin/assistance/${A1.d.id}`, { method: 'PATCH', token: admin.token, body: { status: 'rejected' } })).s === 400, 'decided application cannot be changed');
const fa = (await call('/assistance/mine', { token: farmer.token })).d;
ok(fa.find((a) => a.id === A1.d.id).status === 'approved' && fa.find((a) => a.id === A2.d.id).admin_note === 'Out of stock', 'farmer sees status and admin note');

/* ---- investment plans ---- */
const plans = (await call('/plans')).d;
ok(plans.map((p) => p.duration_months).join() === '12,18,24,36,48,60', 'plans run from 12 months to 5 years');
const p12 = plans[0];
const PAY = meta.paymentsEnabled;
if (!PAY) {
  const off = await call(`/plans/${p12.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 400000 } });
  ok(off.s === 503 && /coming soon/i.test(off.d.error), 'investing says "coming soon" while payments are off');
  ok((await call('/me/history', { token: inv.token })).d.investments.length === 0, 'no investment is created while payments are off');
} else {
ok((await call(`/plans/${p12.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 1000 } })).s === 400, 'below-minimum amount rejected');
ok((await call(`/plans/${p12.id}/invest`, { method: 'POST', token: buyer.token, body: { amount: 100000 } })).s === 403, 'only investors can invest');
const I = await call(`/plans/${p12.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 400000 } });
ok(I.s === 201 && I.d.expected_return === 400000 * p12.rate_percent / 100, 'investor subscribes (pending), expected return computed');
let ih = (await call('/me/history', { token: inv.token })).d.investments[0];
ok(ih.status === 'pending' && !ih.maturity_date, 'pending investment has no countdown yet');
ok((await call(`/admin/investments/${I.d.id}`, { method: 'PATCH', token: inv.token, body: { action: 'confirm' } })).s === 403, 'investor cannot confirm own payment');
ok((await call(`/admin/investments/${I.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'confirm' } })).s === 200, 'admin confirms payment received');
ih = (await call('/me/history', { token: inv.token })).d.investments[0];
const daysLeft = (Date.parse(ih.maturity_date) - Date.now()) / 864e5;
ok(ih.display_status === 'active' && daysLeft > 360 && daysLeft < 367, 'active investment matures about 12 months from confirmation');
ok((await call(`/admin/investments/${I.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'confirm' } })).s === 400, 'cannot confirm twice');
ok((await call(`/admin/plans/${p12.id}`, { method: 'PATCH', token: admin.token, body: { rate_percent: 15 } })).s === 200, 'admin edits a plan rate');
ok((await call('/me/history', { token: inv.token })).d.investments[0].rate_percent === p12.rate_percent, 'existing investments keep their original rate');
ok((await call('/admin/plans', { method: 'POST', token: admin.token, body: { duration_months: 30, rate_percent: 15, min_amount: 100000 } })).s === 201, 'admin adds a 30-month plan');
ok((await call(`/admin/investments/${I.d.id}`, { method: 'PATCH', token: admin.token, body: { action: 'paid' } })).s === 200, 'admin marks investment paid out');
}

/* ---- overview ---- */
const ov = (await call('/admin/overview', { token: admin.token })).d;
ok(ov.invested === (PAY ? 400000 : 0) && ov.traded === 400000, 'admin overview totals');

/* ---- admins, passwords ---- */
const partner = await call('/admin/admins', { method: 'POST', token: admin.token, body: { name: 'Partner', email: `partner${stamp}@t.com`, password: 'temp-pass-1' } });
ok(partner.s === 201, 'admin creates another admin');
ok((await call('/admin/admins', { method: 'POST', token: admin.token, body: { name: 'P', email: `partner${stamp}@t.com`, password: 'temp-pass-1' } })).s === 409, 'duplicate admin email rejected');
ok((await call('/admin/admins', { method: 'POST', token: buyer.token, body: { name: 'X', email: 'x@x.com', password: 'password123' } })).s === 403, 'non-admin cannot create admins');
const pLogin = (await call('/auth/login', { method: 'POST', body: { email: `partner${stamp}@t.com`, password: 'temp-pass-1' } })).d;
ok(pLogin.user?.role === 'admin' && (await call('/admin/overview', { token: pLogin.token })).s === 200, 'new admin can log in and use the portal');
ok((await call('/auth/change-password', { method: 'POST', token: pLogin.token, body: { current_password: 'wrong', new_password: 'brand-new-pass' } })).s === 400, 'wrong current password rejected');
ok((await call('/auth/change-password', { method: 'POST', token: pLogin.token, body: { current_password: 'temp-pass-1', new_password: 'brand-new-pass' } })).s === 200, 'password changed');
ok((await call(`/admin/admins/${admin.user.id}`, { method: 'DELETE', token: admin.token })).s === 400, 'cannot remove own admin access');
ok((await call(`/admin/admins/${partner.d.id}`, { method: 'DELETE', token: admin.token })).s === 200, 'admin access removed from partner');
ok((await call('/admin/overview', { token: pLogin.token })).s === 401, 'removed admin\'s old session stops working');

/* ---- forgot / reset password ---- */
const f1 = await call('/auth/forgot', { method: 'POST', body: { email: `buyer${stamp}@t.com` } });
const f2 = await call('/auth/forgot', { method: 'POST', body: { email: 'nobody@nowhere.com' } });
ok(f1.s === 200 && f2.s === 200 && f1.d.message === f2.d.message && !f2.d.debug_link, 'forgot-password answers the same for unknown emails');
const tok = new URL(f1.d.debug_link).searchParams.get('token');
ok((await call('/auth/reset', { method: 'POST', body: { token: 'bad', password: 'newpass123' } })).s === 400, 'invalid reset token rejected');
ok((await call('/auth/reset', { method: 'POST', body: { token: tok, password: 'newpass123' } })).s === 200, 'password reset with emailed token');
ok((await call('/auth/login', { method: 'POST', body: { email: `buyer${stamp}@t.com`, password: 'newpass123' } })).s === 200, 'login works with the reset password');
ok((await call('/auth/reset', { method: 'POST', body: { token: tok, password: 'another123' } })).s === 400, 'reset link cannot be reused');
ok((await call(`/admin/users/${buyer.user.id}/password`, { method: 'PATCH', token: admin.token, body: { password: 'admin-set-1' } })).s === 200, 'admin sets a temporary password for a user');
ok((await call(`/admin/users/${admin.user.id}/password`, { method: 'PATCH', token: admin.token, body: { password: 'admin-set-1' } })).s === 404, 'admin passwords cannot be changed this way');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
