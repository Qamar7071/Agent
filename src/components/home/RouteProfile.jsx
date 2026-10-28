import { kkhProfile } from '../../lib/data.js';
import { metres } from '../../lib/format.js';

// The Karakoram Highway as a climb: road kilometres across, altitude up. Built from the
// same curated legs the planner uses, so it tells the same story as every itinerary.
const POINTS = kkhProfile();
const TOTAL = POINTS[POINTS.length - 1].km;
const TOP = Math.max(...POINTS.map((p) => p.altitude));
const SHOW = { islamabad: 'all', chilas: 'all', gilgit: 'md', hunza: 'all', passu: 'md', khunjerab: 'all' };
const x = (p) => (p.km / TOTAL) * 100;
const y = (p) => 100 - (p.altitude / TOP) * 82 - 6;

export default function RouteProfile() {
  const pathD = POINTS.map((p, i) => `${i ? 'L' : 'M'} ${x(p)} ${y(p)}`).join(' ');
  const summary = `Islamabad to the Khunjerab Pass on the Karakoram Highway: about ${TOTAL.toLocaleString('en-US')} km by road, `
    + `climbing from about ${metres(POINTS[0].altitude)} to ${metres(TOP)}. Most travellers stop overnight in Chilas.`;
  return (
    <figure className="mt-10 w-full">
      <figcaption className="max-w-[60ch] text-sm text-white/85">
        {summary}
      </figcaption>
      <div className="relative mt-14 h-[110px] sm:mt-10 sm:h-[140px]" role="img" aria-label={summary}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible motion-safe:animate-reveal" aria-hidden="true">
          <path d={`${pathD} L 100 100 L 0 100 Z`} fill="url(#climb)" opacity="0.5" />
          <defs>
            <linearGradient id="climb" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#E39A3B" stopOpacity="0.45" />
              <stop offset="1" stopColor="#E39A3B" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={pathD} fill="none" stroke="#F2C27F" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {POINTS.map((p) => (
          <div key={p.key} className="absolute motion-safe:animate-appear" style={{ left: `${x(p)}%`, top: `${y(p)}%` }}>
            <span className="absolute -left-[4px] -top-[4px] h-2 w-2 rounded-full bg-apricot-300 ring-2 ring-juniper-950/40" />
            {SHOW[p.key] && (
              <span className={`${SHOW[p.key] === 'md' ? 'hidden md:block' : 'block'} absolute bottom-3 whitespace-nowrap text-xs leading-tight text-white ${p.key === 'khunjerab' ? 'right-0 text-right' : p.key === 'islamabad' ? 'left-0' : '-translate-x-1/2 text-center'}`}>
                <span className="block font-semibold">{p.name}</span>
                <span className="num block text-white/80">{metres(p.altitude)}</span>
                {p.key === 'chilas' && <span className="block text-apricot-300">overnight</span>}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="num mt-2 flex justify-between text-xs text-white/70" aria-hidden="true">
        <span>0 km</span>
        <span>{TOTAL.toLocaleString('en-US')} km</span>
      </div>
    </figure>
  );
}
