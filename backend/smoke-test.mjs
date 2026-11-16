// Run with the API started on PORT (default 4100):  npm test
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

const farmer = (await reg('farmer')).d, buyer = (await reg('buyer')).d, inv = (await reg('investor', { state: undefined })).d;
ok(farmer.token && buyer.token && inv.token, 'register farmer, buyer, investor');
ok((await reg('farmer')).s === 409, 'duplicate email rejected');
ok((await reg('farmer', { email: 'x@y.com', state: 'Nowhere' })).s === 400, 'invalid state rejected');
ok((await call('/auth/register', { method: 'POST', body: { name: 'a', email: 'a@a.com', password: 'password123', role: 'admin' } })).s === 400, 'cannot self-register as admin');

const admin = (await call('/auth/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } })).d;
ok(admin.user?.role === 'admin', 'admin login');

ok((await call('/equipment', { method: 'POST', token: farmer.token, form: photoForm({ name: 'T', type: 'Tractor', price_per_day: 5000 }) })).s === 403, 'farmer cannot add equipment');
const eq = await call('/equipment', { method: 'POST', token: admin.token, form: photoForm({ name: 'John Deere', type: 'Tractor', price_per_day: 50000, state: 'Kano' }) });
ok(eq.s === 201, 'admin adds equipment with photo');
const eqList = (await call('/equipment')).d;
ok(eqList.length === 1 && eqList[0].image_id, 'equipment listed with image');

const L = await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'Brown rice', category: 'Grains & Cereals', quantity: 100, unit: 'bag', price: 40000 }) });
ok(L.s === 201, 'farmer uploads produce with photo');
ok((await call('/listings', { method: 'POST', token: farmer.token, form: photoForm({ title: 'X', category: 'Bogus', quantity: 1, price: 1 }) })).s === 400, 'bad category rejected');
const bad = new FormData(); Object.entries({ title: 'T', category: 'Fruits', quantity: 1, price: 1 }).forEach(([k, v]) => bad.append(k, v)); bad.append('images', new Blob(['not an image'], { type: 'image/png' }), 'x.png');
ok((await call('/listings', { method: 'POST', token: farmer.token, form: bad })).s === 400, 'fake image rejected');
const L2 = await call('/listings', { method: 'POST', token: admin.token, form: photoForm({ farmer_id: farmer.user.id, title: 'Tomatoes', category: 'Vegetables', quantity: 20, unit: 'crate', price: 15000 }) });
ok(L2.s === 201, 'admin uploads produce on behalf of farmer');
ok((await call('/listings', { method: 'POST', token: buyer.token, form: photoForm({ title: 'T', category: 'Fruits', quantity: 1, price: 1 }) })).s === 403, 'buyer cannot list produce');

const near = (await call('/listings?state=Lagos')).d;
ok(near.length === 2, 'filter produce by farmer state');
ok((await call('/listings?state=Kano')).d.length === 0, 'no produce in other state');
ok((await call(`/farmers?state=Lagos`)).d.some((f) => f.id === farmer.user.id && f.listings === 2), 'farmers by location');
const sum = (await call('/listings/summary')).d;
ok(sum.find((c) => c.category === 'Vegetables').count === 1 && sum.length === 10, 'home summary groups by category');
const im = await call('/images/' + near[0].image_id);
ok(im.r.headers.get('content-type') === 'image/png', 'image served');

const o = await call('/orders', { method: 'POST', token: buyer.token, body: { listing_id: L.d.id, quantity: 10, delivery_state: 'Lagos' } });
ok(o.s === 201 && o.d.total === 400000, 'buyer places order');
ok((await call('/orders', { method: 'POST', token: buyer.token, body: { listing_id: L.d.id, quantity: 9999 } })).s === 400, 'over-quantity order rejected');
ok((await call(`/orders/${o.d.id}/status`, { method: 'PATCH', token: buyer.token, body: { status: 'confirmed' } })).s === 400, 'buyer cannot confirm');
ok((await call(`/orders/${o.d.id}/status`, { method: 'PATCH', token: farmer.token, body: { status: 'confirmed' } })).s === 200, 'farmer confirms (stock deducted)');
ok((await call('/listings?farmer=' + farmer.user.id)).d.find((l) => l.id === L.d.id).quantity === 90, 'stock reduced to 90');
ok((await call(`/orders/${o.d.id}/status`, { method: 'PATCH', token: farmer.token, body: { status: 'completed' } })).s === 200, 'trade completed');
const hist = (await call('/me/history', { token: buyer.token })).d;
ok(hist.orders[0].status === 'completed' && hist.activity.length >= 3, 'buyer history shows completed trade + activity');
ok((await call('/me/history', { token: farmer.token })).d.orders[0].side === 'selling', 'farmer history shows selling side');

const P = await call('/projects', { method: 'POST', token: farmer.token, body: { title: 'Maize season', crop: 'Maize', amount_needed: 1000000 } });
ok(P.s === 201, 'farmer requests funding');
ok((await call(`/projects/${P.d.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 400000 } })).s === 201, 'investor invests');
ok((await call(`/projects/${P.d.id}/invest`, { method: 'POST', token: inv.token, body: { amount: 700000 } })).s === 400, 'overfunding rejected');
ok((await call('/me/history', { token: inv.token })).d.investments.length === 1, 'investor history');

const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10), later = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
const bk = await call(`/equipment/${eqList[0].id}/book`, { method: 'POST', token: buyer.token, body: { start_date: tomorrow, end_date: later } });
ok(bk.s === 201, 'equipment booked');
ok((await call(`/equipment/${eqList[0].id}/book`, { method: 'POST', token: farmer.token, body: { start_date: tomorrow, end_date: tomorrow } })).s === 409, 'double booking blocked');
ok((await call('/admin/overview', { token: buyer.token })).s === 403, 'non-admin blocked from admin portal');
const ov = (await call('/admin/overview', { token: admin.token })).d;
ok(ov.invested === 400000 && ov.traded === 400000, 'admin overview totals');
ok((await call('/admin/activity', { token: admin.token })).d.length > 5, 'admin sees all activity');
const nf = await call('/admin/farmers', { method: 'POST', token: admin.token, body: { name: 'Mama Ngozi', email: `n${stamp}@t.com`, password: 'password123', state: 'Enugu' } });
ok(nf.s === 201, 'admin registers a farmer on their behalf');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
