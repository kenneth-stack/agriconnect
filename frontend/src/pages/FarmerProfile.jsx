import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, img } from '../api.js';
import ListingCard from '../components/ListingCard.jsx';

export default function FarmerProfile({ user }) {
  const { id } = useParams();
  const [f, setF] = useState(null);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api(`/farmers/${id}`).then(setF).catch((e) => setErr(e.message));
    api(`/listings?farmer=${id}`).then(setItems).catch(() => {});
  }, [id]);
  if (err) return <p className="error">{err}</p>;
  if (!f) return <p className="muted">Loading…</p>;
  return (
    <>
      <h2>{f.name}</h2>
      <p className="muted">📍 {f.state}{f.farm_size_ha ? ` · ${f.farm_size_ha} hectares` : ''}{f.main_crops ? ` · Grows ${f.main_crops}` : ''}</p>
      {f.about && <p>{f.about}</p>}
      {f.photos.length > 0 && <><h3>Farm photos</h3><div className="gallery">{f.photos.map((p) => <img key={p.id} src={img(p.id)} alt={p.caption || `Farm of ${f.name}`} loading="lazy" />)}</div></>}
      <h3>Produce available</h3>
      <div className="grid">{items.map((l) => <ListingCard key={l.id} l={l} user={user} />)}</div>
      {!items.length && <p className="muted">Nothing listed right now.</p>}
    </>
  );
}
