import { useEffect, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL || '';

export const session = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  save(t, u) { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); }
};

export async function api(path, { method = 'GET', body } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { ...(body && !isForm && { 'Content-Type': 'application/json' }), ...(session.token && { Authorization: 'Bearer ' + session.token }) },
    body: isForm ? body : body && JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export const img = (id) => `${BASE}/api/images/${id}`;
export const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
export const when = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export const EMOJI = {
  'Grains & Cereals': '🌾', 'Tubers & Roots': '🍠', Vegetables: '🍅', Fruits: '🍊', 'Legumes & Pulses': '🫘',
  'Oils & Nuts': '🥜', 'Livestock & Poultry': '🐓', 'Fish & Seafood': '🐟', 'Cash Crops': '🍫', 'Spices & Herbs': '🌶️'
};

let metaCache;
export function useMeta() {
  const [m, setM] = useState(metaCache);
  useEffect(() => { if (!metaCache) api('/meta').then((x) => { metaCache = x; setM(x); }).catch(() => {}); }, []);
  return m || { categories: [], states: [], units: [], equipmentTypes: [] };
}

// Phone photos are huge: shrink to max 1600px JPEG before uploading
export function shrink(file, max = 1600) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(new File([b], 'photo.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.82);
    };
    im.onerror = () => resolve(file);
    im.src = url;
  });
}
