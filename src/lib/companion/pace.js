// Budget pace during the trip: how much has gone, against how much the plan expected by now.
//
// The plan's day-by-day costs (Raahi's cost model) give the *shape* of spending: which days are
// expensive (drives, hotels) and which are cheap. The traveller's own budget gives the *size*.
// So "expected by day 4" = budget × (share of the plan's cost that falls on days 1–4). This keeps
// warnings honest even when the cost model's prices differ from what the group actually pays.
//
// Everything here is plain, deterministic and runs offline.

export const CATEGORIES = ['stay', 'food', 'transport', 'activities', 'shopping', 'other'];
// Categories the plan has a cost for. Shopping and "other" are tracked but have no plan share.
export const PLANNED = ['stay', 'food', 'transport', 'activities'];

const DAY_MS = 86400000;

function utc(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Today's calendar date on this device, YYYY-MM-DD. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const t = new Date(utc(dateStr) + n * DAY_MS);
  return t.toISOString().slice(0, 10);
}

/** 0 = before the trip, 1..n = trip day, n + 1 = after the trip. */
export function tripDay(startDate, today, nDays) {
  if (!startDate) return 1;
  const d = Math.floor((utc(today) - utc(startDate)) / DAY_MS) + 1;
  if (d < 1) return 0;
  return Math.min(d, nDays + 1);
}

/** A plan day's cost in companion categories (the guide counts as an activity). */
export function dayCost(cost = {}) {
  const c = {
    stay: Math.round(cost.accommodation || 0),
    food: Math.round(cost.food || 0),
    transport: Math.round(cost.transport || 0),
    activities: Math.round((cost.activities || 0) + (cost.guide || 0)),
  };
  c.total = c.stay + c.food + c.transport + c.activities;
  return c;
}

function sameShape(a, b) {
  return a.length === b.length && a.every((d, i) => d.day === b[i].day);
}

/**
 * The plan's day costs, with any changes the group accepted during the trip applied from their
 * day onwards. Days before a change keep their original cost.
 * days: [{day, cost}] from the itinerary; alternatives: [{id, days: [{day, cost}]}];
 * adjustments: [{altId, fromDay}] in the order they were accepted.
 */
export function plannedDays(days = [], alternatives = [], adjustments = []) {
  let out = days.map((d) => ({ day: d.day, cost: dayCost(d.cost) }));
  for (const adj of adjustments) {
    const alt = alternatives.find((a) => a.id === adj.altId);
    if (!alt || !sameShape(out, alt.days)) continue;
    out = out.map((d, i) => (d.day >= adj.fromDay ? { day: d.day, cost: dayCost(alt.days[i].cost) } : d));
  }
  return out;
}

function sum(list, f) {
  return list.reduce((s, x) => s + f(x), 0);
}

const live = (expenses) => expenses.filter((e) => !e.deleted && e.amountPkr > 0);

/**
 * Pace on trip day `dayIndex` (0..n+1).
 * planned: output of plannedDays(); budgetTotal: the group's whole budget in Rs, or null.
 * Returns BudgetPace plus the detail the screens and the nudge rules need.
 */
export function pace({ planned, budgetTotal, expenses = [], dayIndex }) {
  const n = planned.length;
  const d = Math.max(0, Math.min(dayIndex, n));
  const P = sum(planned, (x) => x.cost.total);
  const cum = (cat, upTo) => sum(planned.filter((x) => x.day <= upTo), (x) => (cat ? x.cost[cat] : x.cost.total));
  const share = (cat) => {
    const total = cum(cat, n);
    return total > 0 ? cum(cat, d) / total : 1;
  };
  const plannedShare = P > 0 ? cum(null, d) / P : 0;

  const ex = live(expenses);
  const prepaid = ex.filter((e) => e.dayIndex === 0);
  const during = ex.filter((e) => e.dayIndex >= 1 && e.dayIndex <= d);
  const spentAll = sum(ex, (e) => e.amountPkr);

  // Money paid before the trip (an advance for hotels or flights) counts as used in step with the
  // plan: if the plan's stays are 40% done, 40% of a prepaid hotel advance is "spent to date".
  const byCat = {};
  for (const c of CATEGORIES) {
    const pre = sum(prepaid.filter((e) => e.category === c), (e) => e.amountPkr);
    const plannedCat = PLANNED.includes(c);
    const used = plannedCat ? pre * share(c) : pre;
    byCat[c] = {
      category: c,
      spentToDate: Math.round(sum(during.filter((e) => e.category === c), (e) => e.amountPkr) + used),
      spentAll: Math.round(sum(ex.filter((e) => e.category === c), (e) => e.amountPkr)),
      prepaidFuture: Math.round(pre - used),
      plannedTotal: plannedCat ? cum(c, n) : 0,
      plannedToDate: plannedCat ? cum(c, d) : 0,
    };
  }
  const spentToDate = sum(CATEGORIES, (c) => byCat[c].spentToDate);
  const prepaidFuture = sum(CATEGORIES, (c) => byCat[c].prepaidFuture);
  const daysLeft = Math.max(0, n - d);

  const out = {
    dayIndex, days: n, daysLeft,
    budgetTotal: budgetTotal || null,
    spentToDate, spentAll, prepaidFuture,
    plannedShare,
    planTotal: P,
    byCategory: CATEGORIES.map((c) => byCat[c]),
    perDay: Array.from({ length: n + 1 }, (_, i) => sum(ex.filter((e) => e.dayIndex === i), (e) => e.amountPkr)),
  };
  if (!budgetTotal) {
    return { ...out, plannedToDate: null, plannedPct: null, spentPct: null, status: null, remaining: null };
  }
  const B = budgetTotal;
  const scale = P > 0 ? B / P : 0;
  for (const c of out.byCategory) {
    c.plannedToDateScaled = Math.round(c.plannedToDate * scale);
    c.plannedTotalScaled = Math.round(c.plannedTotal * scale);
  }
  const plannedToDate = Math.round(B * plannedShare);
  const plannedPct = Math.round(plannedShare * 1000) / 10;
  const spentPct = Math.round((spentToDate / B) * 1000) / 10;
  const remaining = B - spentAll;                                  // cash still free to spend
  const plannedNeed = Math.max(0, B - plannedToDate - prepaidFuture); // new cash the rest of the plan needs
  const gap = spentPct - plannedPct;
  let status = 'on_track';
  if (d >= 1 && gap > 30) status = 'over';
  else if (d >= 1 && gap > 15) status = 'careful';
  if (spentAll > B) status = 'over';
  return {
    ...out,
    plannedToDate, plannedPct, spentPct, status, remaining, plannedNeed,
    perDayLeft: daysLeft > 0 ? Math.floor(remaining / daysLeft) : null,
    plannedPerDay: daysLeft > 0 ? Math.floor(plannedNeed / daysLeft) : null,
    dayPlanScaled: planned.map((x) => Math.round(x.cost.total * scale)),
  };
}
