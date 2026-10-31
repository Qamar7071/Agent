// Best month advisor: for a set of places, which months suit all of them, from the guide's
// typical seasons (best months per place, and months when a seasonal access route is usually
// closed). Typical patterns only: never a forecast, and never a claim that a road is open.
// `fit(id, month)` returns 'best' | 'possible' | 'closed' (see seasonFit in data.js).

export function monthTable(ids, fit) {
  const places = [...new Set(ids || [])];
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const row = { month, best: [], possible: [], closed: [] };
    for (const id of places) row[fit(id, month)].push(id);
    row.verdict = !places.length ? 'none'
      : row.closed.length ? 'closed'
        : row.best.length === places.length ? 'best' : 'possible';
    return row;
  });
}

/** Group consecutive months (wrapping December to January) into runs like [[6,7,8,9]]. */
export function runsOf(months) {
  const set = new Set(months);
  if (!set.size) return [];
  if (set.size === 12) return [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]];
  const prev = (m) => ((m + 10) % 12) + 1;
  const start = Array.from({ length: 12 }, (_, i) => i + 1).find((m) => set.has(m) && !set.has(prev(m)));   // a run's first month
  const runs = [];
  let run = [];
  for (let k = 0; k < 12; k += 1) {
    const m = ((start - 1 + k) % 12) + 1;
    if (set.has(m)) run.push(m);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Advice for a set of places and, optionally, the month the traveller has in mind.
 * Returns { table, best: months where every place is at its best, fallback: months with no
 * closed access and the most places at their best (when no month suits all), chosen: the row
 * for `month`, closedIn: places whose access is usually closed in `month` }.
 */
export function advise(ids, fit, month = null) {
  const table = monthTable(ids, fit);
  const best = table.filter((r) => r.verdict === 'best').map((r) => r.month);
  let fallback = [];
  if (!best.length) {
    const open = table.filter((r) => r.verdict === 'possible');
    const most = Math.max(0, ...open.map((r) => r.best.length));
    fallback = open.filter((r) => r.best.length === most && most > 0).map((r) => r.month);
  }
  const chosen = month ? table[month - 1] : null;
  return { table, best, fallback, chosen, closedIn: chosen ? chosen.closed : [] };
}
