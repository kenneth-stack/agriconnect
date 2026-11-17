import { useEffect, useState } from 'react';

// Live countdown to a date: days, hours, minutes, seconds
export default function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, Date.parse(to) - now);
  const parts = [['Days', Math.floor(ms / 864e5)], ['Hrs', Math.floor((ms % 864e5) / 36e5)], ['Min', Math.floor((ms % 36e5) / 6e4)], ['Sec', Math.floor((ms % 6e4) / 1e3)]];
  return (
    <div className="count" role="timer" aria-label={`${parts[0][1]} days ${parts[1][1]} hours left`}>
      {parts.map(([l, v]) => <div key={l}><b>{String(v).padStart(2, '0')}</b><span>{l}</span></div>)}
    </div>
  );
}
