import { useEffect, useId, useState } from 'react';

// Tries each source in order; if all fail, renders a bright alpine illustration so the
// layout never shows a broken image.
export default function SmartImage({ sources = [], alt, className = '', imgClassName = '', eager = false, tone = ['#1D4D6E', '#41C6C0'], sizes }) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const key = sources.join('|');

  useEffect(() => {
    setIdx(0);
    setLoaded(false);
  }, [key]);

  const src = sources[idx];
  const failed = idx >= sources.length;

  return (
    <div className={`relative overflow-hidden bg-[#CFE4F7] ${className}`}>
      {!failed && (
        <img
          key={src}
          src={src}
          alt={alt}
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority={eager ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIdx((i) => i + 1);
          }}
          className={`h-full w-full object-cover transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
      {!loaded && !failed && (
        <div aria-hidden="true" className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.45)_50%,rgba(255,255,255,0)_100%)] bg-[length:800px_100%]" />
      )}
      {failed && <AlpineArt tone={tone} alt={alt} className={imgClassName} />}
    </div>
  );
}

function AlpineArt({ tone, alt, className }) {
  const id = useId().replace(/:/g, '');
  const lake = tone[1];
  return (
    <svg role="img" aria-label={alt} viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className={`absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3F8FE0" />
          <stop offset="0.6" stopColor="#A9D4FF" />
          <stop offset="1" stopColor="#E8F4FF" />
        </linearGradient>
        <linearGradient id={`lake${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lake} />
          <stop offset="1" stopColor="#0E5C6B" />
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill={`url(#sky${id})`} />
      <g fill="#FFFFFF" opacity="0.85">
        <ellipse cx="150" cy="80" rx="70" ry="16" />
        <ellipse cx="200" cy="70" rx="45" ry="18" />
        <ellipse cx="620" cy="60" rx="80" ry="14" />
      </g>
      <polygon points="0,330 90,220 160,260 260,140 340,210 420,120 520,200 600,130 700,210 800,170 800,340 0,340" fill="#9DB8D4" />
      <g fill="#FFFFFF">
        <polygon points="260,140 236,170 250,166 262,180 274,166 290,172" />
        <polygon points="420,120 396,152 410,148 422,162 436,148 450,156" />
        <polygon points="600,130 578,160 592,156 604,170 616,156 630,162" />
      </g>
      <polygon points="0,360 120,270 200,300 330,220 430,300 560,240 680,300 800,260 800,370 0,370" fill="#5E7E9C" />
      <polygon points="0,380 0,330 60,300 110,340 170,310 230,350 300,320 360,360 800,360 800,380" fill="#2F5D4A" />
      <rect y="372" width="800" height="128" fill={`url(#lake${id})`} />
      <g stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round">
        <line x1="120" y1="410" x2="200" y2="410" />
        <line x1="420" y1="440" x2="520" y2="440" />
        <line x1="620" y1="400" x2="680" y2="400" />
      </g>
    </svg>
  );
}
