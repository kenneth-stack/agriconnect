import { img } from '../api.js';

export default function Avatar({ id, name = '', size = 40 }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  return id
    ? <img className="avatar" style={{ width: size, height: size }} src={img(id)} alt={`${name || 'User'} profile picture`} />
    : <span className="avatar ph" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>{initials}</span>;
}
