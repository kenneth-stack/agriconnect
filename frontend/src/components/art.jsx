// Hand-drawn hero illustration: sunrise over rows of crops, with a tractor.
export function HeroArt() {
  return (
    <svg viewBox="0 0 640 400" role="img" aria-label="Sunrise over green farm fields with a tractor" className="hero-art">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7cc4d8" /><stop offset="1" stopColor="#fbe7a1" /></linearGradient>
        <linearGradient id="f1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4c9f5b" /><stop offset="1" stopColor="#1d6b43" /></linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#sky)" />
      <circle cx="470" cy="150" r="58" fill="#f6b93b" opacity=".95" />
      <path d="M0 220 Q160 160 320 215 T640 190 V400 H0Z" fill="#7fb96a" />
      <path d="M0 270 Q200 215 400 265 T640 245 V400 H0Z" fill="url(#f1)" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${-20 + i * 20} 400 Q${180 + i * 50} ${300 - i * 4} ${330 + i * 40} ${262 + i * 6}`} stroke="#14502f" strokeWidth="3" fill="none" opacity=".45" />
      ))}
      <g transform="translate(90 268)">
        <rect x="0" y="22" width="86" height="34" rx="6" fill="#e9b82f" />
        <rect x="42" y="0" width="38" height="30" rx="4" fill="#d89b12" /><rect x="48" y="6" width="26" height="16" fill="#cfe9f1" />
        <circle cx="22" cy="62" r="22" fill="#16241c" /><circle cx="22" cy="62" r="9" fill="#9aa8a0" />
        <circle cx="76" cy="68" r="14" fill="#16241c" /><circle cx="76" cy="68" r="6" fill="#9aa8a0" />
      </g>
      <g fill="#14502f"><path d="M520 300 l-8-40 l8 10 l8-10z" /><path d="M548 312 l-8-44 l8 10 l8-10z" /><path d="M576 300 l-8-38 l8 10 l8-10z" /></g>
    </svg>
  );
}
