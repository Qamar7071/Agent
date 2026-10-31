// Nudges: small, friendly, actionable checks while the trip is on. The rules are deterministic;
// the wording is a template in the traveller's language (an AI may reword it, never the numbers).
//
// R1: spent% − planned% > 15 points → careful; > 30 → over.
// R2: a category is above 110% of its planned share to date (and at least 2% of the budget over,
//     so a few hundred rupees on day 1 don't nag).
// R3: money left per remaining day is below 80% of what the rest of the plan needs per day.
// R4: one expense above 20% of that day's plan → a gentle "is this right?" check (catches typos).
// Limits: at most 2 nudges per calendar day; the same rule at most once every 24 hours.

import { PLANNED } from './pace.js';

export const MAX_PER_DAY = 2;
const HOURS_24 = 24 * 3600 * 1000;
const SEVERITY = { over: 3, careful: 2, info: 1 };
const MIN_SAVING = 1000;

function sameLocalDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Savings from switching the remaining days to an alternative plan (cost-model estimates). */
export function altSavings({ planned, alternatives = [], adjustments = [], fromDay }) {
  const used = new Set(adjustments.map((a) => a.altId));
  const out = [];
  for (const alt of alternatives) {
    if (used.has(alt.id) || alt.days.length !== planned.length) continue;
    let saving = 0;
    planned.forEach((d, i) => {
      if (d.day < fromDay) return;
      const a = alt.days[i].cost || {};
      const altTotal = (a.accommodation || 0) + (a.food || 0) + (a.transport || 0) + (a.activities || 0) + (a.guide || 0);
      saving += d.cost.total - altTotal;
    });
    saving = Math.round(saving / 100) * 100;
    if (saving >= MIN_SAVING) {
      out.push({ id: `alt:${alt.id}`, kind: alt.id, label: alt.id,
        action: { type: 'apply_alt', altId: alt.id, fromDay },
        estSavingPkr: saving, source: 'Raahi cost model (estimate)' });
    }
  }
  return out.sort((a, b) => b.estSavingPkr - a.estSavingPkr);
}

const keep = { id: 'keep', kind: 'keep', action: { type: 'dismiss' } };

/** Candidate nudges for the current state, before limits. */
export function candidates({ p, planned, alternatives, adjustments, lastExpense }) {
  const out = [];
  const B = p.budgetTotal;
  const d = Math.min(p.dayIndex, p.days);
  const tomorrow = d + 1;
  const canChange = p.dayIndex >= 1 && tomorrow <= p.days;
  const savers = canChange ? altSavings({ planned, alternatives, adjustments, fromDay: tomorrow }) : [];

  if (B && d >= 1) {
    const gap = p.spentPct - p.plannedPct;
    if (gap > 15) {
      out.push({ ruleId: 'R1', severity: gap > 30 ? 'over' : 'careful',
        facts: { day: d, spentPct: Math.round(p.spentPct), plannedPct: Math.round(p.plannedPct), spent: p.spentToDate,
          planned: p.plannedToDate },
        options: [...savers.slice(0, 2), keep] });
    }
    if (p.daysLeft >= 1 && p.plannedNeed > 0 && p.remaining < 0.8 * p.plannedNeed) {
      out.push({ ruleId: 'R3', severity: p.remaining <= 0 ? 'over' : 'careful',
        facts: { day: d, daysLeft: p.daysLeft, perDayLeft: Math.max(0, p.perDayLeft), plannedPerDay: p.plannedPerDay,
          remaining: p.remaining },
        options: [...savers.slice(0, 2), keep] });
    }
    const overruns = p.byCategory
      .filter((c) => PLANNED.includes(c.category) && c.plannedToDateScaled > 0
        && c.spentToDate > 1.1 * c.plannedToDateScaled && c.spentToDate - c.plannedToDateScaled >= 0.02 * B)
      .sort((a, b) => (b.spentToDate - b.plannedToDateScaled) - (a.spentToDate - a.plannedToDateScaled));
    const c = overruns[0];   // one category at a time: the biggest overrun
    if (c) {
      const left = c.plannedTotalScaled - c.spentAll;
      const target = p.daysLeft >= 1 && left > 0 ? Math.floor(left / p.daysLeft / 100) * 100 : null;
      const options = [];
      if (target) {
        options.push({ id: `cap:${c.category}`, kind: 'cap', action: { type: 'acknowledge' },
          perDayTarget: target, category: c.category, source: 'Your budget' });
      }
      const related = savers.filter((s) => (c.category === 'stay' && s.kind === 'stay_down')
        || (c.category === 'transport' && s.kind === 'bus'));
      out.push({ ruleId: 'R2', severity: 'careful',
        facts: { day: d, category: c.category, spent: c.spentToDate, planned: c.plannedToDateScaled,
          pct: Math.round((c.spentToDate / c.plannedToDateScaled) * 100) },
        options: [...options, ...related.slice(0, 1), keep] });
    }
  }
  if (lastExpense && !lastExpense.deleted && lastExpense.dayIndex >= 1 && lastExpense.dayIndex <= p.days) {
    const dayPlan = B ? p.dayPlanScaled?.[lastExpense.dayIndex - 1]
      : planned[lastExpense.dayIndex - 1]?.cost.total;
    if (dayPlan && lastExpense.amountPkr > 0.2 * dayPlan) {
      out.push({ ruleId: 'R4', severity: 'info', expenseId: lastExpense.id,
        facts: { amount: lastExpense.amountPkr, category: lastExpense.category, dayPlan, day: lastExpense.dayIndex },
        options: [{ id: 'ok', kind: 'ok', action: { type: 'dismiss' } },
          { id: 'fix', kind: 'fix', action: { type: 'edit_expense', expenseId: lastExpense.id } }] });
    }
  }
  return out;
}

/**
 * New nudges to show now, respecting the limits. `history` is every nudge created so far
 * (dismissed ones included). Returns at most the number of slots left today.
 */
export function evaluate({ p, planned, alternatives, adjustments, lastExpense, history = [], now = Date.now(),
  newId = () => Math.random().toString(36).slice(2) }) {
  const today = history.filter((h) => sameLocalDay(h.createdAt, now));
  let slots = MAX_PER_DAY - today.length;
  if (slots <= 0) return [];
  const recent = new Set(history.filter((h) => now - new Date(h.createdAt).getTime() < HOURS_24).map((h) => h.ruleId));
  const order = { R1: 1, R3: 2, R2: 3, R4: 4 };
  const fresh = candidates({ p, planned, alternatives, adjustments, lastExpense })
    .filter((c) => !recent.has(c.ruleId))
    .sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || order[a.ruleId] - order[b.ruleId]);
  // A big single expense is checked first, alone: if it was a typo (95,000 for 9,500), pace
  // warnings would be wrong. Once the group confirms it, the pace rules run again.
  const check = fresh.find((c) => c.ruleId === 'R4');
  if (check) return [{ ...check, id: newId(), createdAt: new Date(now).toISOString(), dismissed: false, choice: null }];
  // R1 and R3 say the same thing in two ways; show the stronger one only.
  const picked = [];
  for (const c of fresh) {
    if (slots <= 0) break;
    if (c.ruleId === 'R3' && picked.some((x) => x.ruleId === 'R1')) continue;
    picked.push({ ...c, id: newId(), createdAt: new Date(now).toISOString(), dismissed: false, choice: null });
    slots -= 1;
  }
  return picked;
}
