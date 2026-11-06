// The trip as map data: each day's moves as segments between approximate place points,
// overnight stops with the nights spent there, and Google Maps directions per day.
// Pure functions (no Leaflet here), so they are unit-tested with node --test.

// Distinct, readable on a light map, never colour alone: every line also has its day number.
export const DAY_COLORS = ['#1F6F50', '#2B6CB0', '#C05621', '#6B46C1', '#B7791F', '#C53030', '#2C7A7B', '#97266D', '#4A5568', '#2F855A'];
export const dayColor = (day) => DAY_COLORS[(day - 1) % DAY_COLORS.length];

/** "1", "2–3", "4, 6": the nights spent at a stop, written compactly. */
export function nightsLabel(days) {
  const s = [...new Set(days)].sort((a, b) => a - b);
  const runs = [];
  for (const d of s) {
    const last = runs[runs.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else runs.push([d, d]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
}

export function mapModel(days, point, name) {
  const segments = [];
  const stops = new Map();
  const touch = (key, kind, day) => {
    const p = point(key);
    if (!p) return;
    if (!stops.has(key)) stops.set(key, { key, name: name(key), point: p, nights: [], visits: [], start: false });
    const s = stops.get(key);
    if (kind === 'night') s.nights.push(day);
    else if (kind === 'visit' && !s.visits.includes(day)) s.visits.push(day);
    else if (kind === 'start') s.start = true;
  };
  const dayInfo = [];
  (days || []).forEach((d) => {
    const pts = [];
    for (const m of d.moves || []) {
      const a = point(m.from);
      const b = point(m.to);
      if (!a || !b) continue;
      touch(m.from, segments.length === 0 ? 'start' : 'visit', d.day);   // the trip's first move starts at home
      touch(m.to, 'visit', d.day);
      segments.push({ day: d.day, from: m.from, to: m.to, mode: m.mode, a, b });
      if (!pts.length) pts.push(a);
      pts.push(b);
    }
    if (d.overnight?.hub) {
      touch(d.overnight.hub, 'night', d.day);
      const p = point(d.overnight.hub);
      if (p && !pts.length) pts.push(p);
    }
    if (!pts.length && d.destination_id && point(d.destination_id)) pts.push(point(d.destination_id));
    dayInfo.push({ day: d.day, title: d.title, type: d.type, color: dayColor(d.day), points: pts,
      moves: (d.moves || []).filter((m) => point(m.from) && point(m.to)).length });
  });
  const all = [...stops.values()].map((s) => s.point);
  const bounds = all.length ? [
    [Math.min(...all.map((p) => p.lat)), Math.min(...all.map((p) => p.lng))],
    [Math.max(...all.map((p) => p.lat)), Math.max(...all.map((p) => p.lng))],
  ] : null;
  return { segments, stops: [...stops.values()], days: dayInfo, bounds };
}

/** Google Maps directions through the day's points (driving; Google picks the road). */
export function directionsUrl(points, mode = 'driving') {
  if (!points || points.length < 2) return null;
  const f = (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  const q = new URLSearchParams({ api: '1', origin: f(points[0]), destination: f(points[points.length - 1]), travelmode: mode });
  const mid = points.slice(1, -1);
  if (mid.length) q.set('waypoints', mid.map(f).join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}
