export const session = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  save(t, u) { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); }
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch((import.meta.env.VITE_API_URL || '') + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session.token && { Authorization: 'Bearer ' + session.token }) },
    body: body && JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
