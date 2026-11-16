import { useMemo } from 'react';
import { shrink } from '../api.js';

export default function PhotoPicker({ files, onChange, max = 4, label = 'Add photos' }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  async function pick(e) {
    const picked = await Promise.all([...e.target.files].slice(0, max - files.length).map((f) => shrink(f)));
    onChange([...files, ...picked]);
    e.target.value = '';
  }
  return (
    <div>
      {files.length < max && (
        <label className="photo-add">📷 {label} ({files.length}/{max})
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={pick} />
        </label>
      )}
      <div className="thumbs">
        {files.map((f, i) => (
          <div key={urls[i]} className="thumb">
            <img src={urls[i]} alt={`Selected photo ${i + 1}`} />
            <button type="button" aria-label="Remove photo" onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
