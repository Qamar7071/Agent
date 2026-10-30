// The Travel Twin's route view: the trip drawn as distance travelled (left to right) against
// approximate altitude, coloured by each day's risk. The wireframe mountains behind it are
// decoration; the glowing line, its stops and colours come from the plan and the safety agent.
import { useMemo } from 'react';

const RISK = { Low: '#3DDC97', Moderate: '#F5B841', High: '#FF6B5B', Severe: '#FF3D6E' };
const VW = 1000;
const VH = 380;

function mesh() {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const peaks = Array.from({ length: 9 }, (_, i) => ({ x: i * 125 + rnd() * 80, h: 70 + rnd() * 110, w: 90 + rnd() * 90 }));
  const height = (x, row) => peaks.reduce((s, p) => s + p.h * Math.exp(-(((x - p.x) / p.w) ** 2)), 0) * (0.35 + row * 0.07);
  const rows = [];
  for (let r = 0; r < 11; r += 1) {
    const base = 120 + r * r * 2.3 + r * 9;
    const pts = [];
    for (let x = -20; x <= VW + 20; x += 25) pts.push([x, base - height(x + r * 30, r) * 0.55]);
    rows.push(pts);
  }
  return rows;
}

export default function TerrainTwin({ profile = [], riskByDay = [], title }) {
  const rows = useMemo(mesh, []);
  const pts = profile.filter((p) => p.altitude_m != null);
  if (pts.length < 2) return null;
  const maxKm = Math.max(1, pts[pts.length - 1].km);
  const alts = pts.map((p) => p.altitude_m);
  const lo = Math.min(...alts) - 300;
  const hi = Math.max(...alts) + 400;
  const x = (km) => 70 + (km / maxKm) * (VW - 140);
  const y = (alt) => 330 - ((alt - lo) / (hi - lo)) * 210;
  const riskOf = (day) => riskByDay.find((d) => d.day === day)?.category || 'Low';
  const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, color: RISK[riskOf(p.day)] || RISK.Low, flight: p.mode === 'flight' }));
  const stops = [];
  pts.forEach((p) => {
    const last = stops[stops.length - 1];
    if (last && last.place === p.place && last.km === p.km) last.days.push(p.day);
    else stops.push({ ...p, days: [p.day] });
  });
  const summary = `${title || 'Trip'}: ${Math.round(maxKm)} km, from ${pts[0].name} (${pts[0].altitude_m} m) up to `
    + `${Math.max(...alts).toLocaleString('en-US')} m.`;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full" role="img" aria-label={summary}>
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4CC9F0" stopOpacity="0.05" />
            <stop offset="1" stopColor="#4CC9F0" stopOpacity="0.35" />
          </linearGradient>
          <filter id="glow" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g aria-hidden="true" stroke="url(#fade)" fill="none" strokeWidth="0.8">
          {rows.map((r, i) => <polyline key={i} points={r.map(([a, b]) => `${a},${b}`).join(' ')} />)}
          {rows[0].map((_, j) => (j % 2 === 0 ? (
            <polyline key={`v${j}`} points={rows.map((r) => `${r[j][0]},${r[j][1]}`).join(' ')} strokeOpacity="0.5" />
          ) : null))}
        </g>
        <g aria-hidden="true">
          {segs.map((s, i) => (
            <line key={i} x1={x(s.a.km)} y1={y(s.a.altitude_m)} x2={x(s.b.km)} y2={y(s.b.altitude_m)} stroke={s.color}
              strokeWidth="4" strokeLinecap="round" strokeDasharray={s.flight ? '10 8' : undefined} filter="url(#glow)" />
          ))}
          {stops.map((p, i) => (
            <g key={i} transform={`translate(${x(p.km)},${y(p.altitude_m)})`}>
              <circle r="7" fill="#070d14" stroke={RISK[riskOf(p.days[p.days.length - 1])] || '#E6EDF0'} strokeWidth="2.5" />
              <text y={i % 2 ? 26 : -16} textAnchor="middle" fontSize="12" fill="#E6EDF0" fontWeight="600">{p.name.replace(' (Hunza)', '')}</text>
              <text y={i % 2 ? 40 : -30} textAnchor="middle" fontSize="10.5" fill="#A7B4BB">
                {p.days.filter((d) => d > 0).length ? `Day ${p.days.filter((d) => d > 0).join(', ')} · ` : 'Start · '}{p.altitude_m.toLocaleString('en-US')} m
              </text>
            </g>
          ))}
        </g>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        {Object.entries(RISK).slice(0, 3).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="status-dot" style={{ background: c }} />{k} risk</span>
        ))}
        <span>Left to right: distance along the route ({Math.round(maxKm)} km). Height: approximate altitude. Dashed: flight.</span>
      </figcaption>
    </figure>
  );
}
