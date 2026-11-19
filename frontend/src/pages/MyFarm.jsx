import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, img, naira, when } from '../api.js';
import ListingForm from '../components/ListingForm.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';

export default function MyFarm({ user }) {
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [files, setFiles] = useState([]);
  const [caption, setCaption] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => {
    api(`/farmers/${user.id}`).then(setProfile);
    api(`/listings?farmer=${user.id}`).then(setListings);
    api('/me/history').then((h) => setOrders(h.orders.filter((o) => o.side === 'selling')));
  };
  useEffect(() => { if (user?.role === 'farmer') load(); }, []);
  if (user?.role !== 'farmer') return <Navigate to="/" />;
  if (!profile) return <p className="muted">Loading…</p>;

  const run = async (fn, ok) => { try { await fn(); setMsg({ ok }); load(); } catch (e) { setMsg({ err: e.message }); } };
  const setP = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });
  const del = (text, fn, ok) => window.confirm(text) && run(fn, ok);

  return (
    <>
      <h2>My farm</h2>
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}{msg?.err && <p className="error" role="alert">{msg.err}</p>}

      <section className="split">
        <ListingForm onDone={load} />
        <div className="stack">
          <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => api('/farm/profile', { method: 'PUT', body: profile }), 'Farm profile saved.'); }}>
            <h3>Farm profile ({profile.state})</h3>
            <label>Farm size (hectares)<input type="number" step="any" value={profile.farm_size_ha ?? ''} onChange={setP('farm_size_ha')} /></label>
            <label>Main crops<input value={profile.main_crops ?? ''} onChange={setP('main_crops')} placeholder="Rice, maize, cassava" /></label>
            <label>About your farm<textarea rows="3" value={profile.about ?? ''} onChange={setP('about')} /></label>
            <button className="btn">Save profile</button>
          </form>
          <form className="card" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(); files.forEach((f) => fd.append('images', f)); if (caption) fd.append('caption', caption);
            run(async () => { await api('/farm/photos', { method: 'POST', body: fd }); setFiles([]); setCaption(''); }, 'Photos uploaded.');
          }}>
            <h3>Farmland photos</h3>
            <PhotoPicker files={files} onChange={setFiles} max={6} label="Add farm photos" />
            <label>Caption (optional)<input value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
            {files.length > 0 && <button className="btn">Upload {files.length} photo(s)</button>}
            <div className="gallery">{profile.photos.map((p) => (
              <figure key={p.id}><img src={img(p.id)} alt={p.caption || 'Farm'} /><button type="button" className="ghost" onClick={() => del('Delete this photo? This cannot be undone.', () => api(`/images/${p.id}`, { method: 'DELETE' }), 'Photo deleted.')}>Delete</button></figure>
            ))}</div>
          </form>
        </div>
      </section>

      <h3>Incoming orders</h3>
      {!orders.length && <p className="muted">No orders yet.</p>}
      <div className="table-wrap"><table><tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>#{o.id} · {when(o.created_at)}</td><td>{o.buyer} wants {o.quantity} {o.unit} of {o.title}</td><td>{naira(o.total)}<br /><span className="muted small">{{ held: 'Paid, held until delivery', released: 'Paid', refunded: 'Refunded', collected: 'Collected on delivery' }[o.payment_status] || 'Collect on delivery'}{o.fulfilment === 'pickup' ? ' · pickup' : ''}</span></td>
            <td><span className={'badge ' + o.status}>{o.status}</span></td>
            <td className="row">
              {o.status === 'pending' && <button className="btn" onClick={() => run(() => api(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: 'confirmed' } }), 'Order confirmed.')}>Confirm</button>}
              {o.status === 'confirmed' && <button className="btn" onClick={() => run(() => api(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: 'completed' } }), 'Marked as completed.')}>Mark completed</button>}
              {['pending', 'confirmed'].includes(o.status) && <button className="ghost" onClick={() => run(() => api(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: 'cancelled' } }), 'Order cancelled.')}>Cancel</button>}
            </td>
          </tr>
        ))}
      </tbody></table></div>

      <h3>My produce on sale</h3>
      <div className="table-wrap"><table><tbody>
        {listings.map((l) => (
          <tr key={l.id}>
            <td><div className="thumbs">{(l.image_ids || []).map((id) => (
              <span className="thumb" key={id}><img src={img(id)} alt={l.title} /><button type="button" aria-label="Delete this photo" onClick={() => del('Delete this photo?', () => api(`/images/${id}`, { method: 'DELETE' }), 'Photo deleted.')}>×</button></span>
            ))}</div></td>
            <td><b>{l.title}</b><br /><span className="muted small">{l.category}</span></td><td>{l.quantity} {l.unit}</td><td>{naira(l.price)}</td>
            <td><button className="ghost" onClick={() => del(`Delete "${l.title}" and all its photos? This cannot be undone.`, () => api(`/listings/${l.id}`, { method: 'DELETE' }), 'Produce deleted.')}>Delete</button></td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
