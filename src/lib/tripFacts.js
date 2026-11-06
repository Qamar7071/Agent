// Facts about a plan for one place, read from the planner's own result. Pure functions,
// unit-tested with node --test.

/**
 * The journey there: the first half of the trip's one-way moves (a trip to one place goes out
 * and comes back the same way). Returns km, hours [low, high], the days it takes, the modes
 * used and the places on the way, or null when the plan has no moves.
 */
export function outboundOf(plan) {
  const moves = [];
  for (const d of plan?.days || []) {
    for (const m of d.moves || []) if (!m.round_trip) moves.push({ ...m, day: d.day });
  }
  if (!moves.length) return null;
  const out = moves.slice(0, Math.max(1, Math.ceil(moves.length / 2)));
  const hours = out.reduce((h, m) => [h[0] + (m.hours?.[0] || 0), h[1] + (m.hours?.[1] || 0)], [0, 0]);
  return {
    km: out.reduce((n, m) => n + (m.km || 0), 0),
    hours: hours.map((h) => Math.round(h * 2) / 2),
    days: new Set(out.map((m) => m.day)).size,
    modes: [...new Set(out.map((m) => m.mode))],
    via: out.slice(0, -1).map((m) => m.to_name || m.to),
    flight: out.some((m) => m.mode === 'flight'),
  };
}

/** How many days are mainly for travel, and how many at the places themselves. */
export function shapeOf(plan) {
  const days = plan?.days || [];
  const travel = days.filter((d) => d.type === 'travel').length;
  return { total: days.length, travel, there: days.length - travel };
}

/** A typical length for a first trip to a place: the guide's usual stay plus the road there and back. */
export const typicalDays = (destination, roadDays = 4) => Math.min(30, (destination?.recommended_days?.default || 2) + roadDays);
