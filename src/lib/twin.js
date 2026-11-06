// What a Travel Twin scenario gains and gives up, read only from the comparison's own numbers
// (backend twin/comparison.py). Pure functions, unit-tested with node --test.
import { pkr } from './format.js';

const CATEGORY = { accommodation: 'stays', transport: 'transport', food: 'food', activities: 'activities',
  contingency: 'contingency', guide: 'guide', entries: 'entry fees' };
const TRANSPORT = { car: 'a hired car', bus: 'public coaches', flight: 'flying north' };

const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const hours = (h) => `${Math.abs(h) % 1 ? Math.abs(h).toFixed(1) : Math.abs(h)} h`;

/**
 * { pros, cons, notes }: plain sentences, each from one number in the comparison.
 * placeName(id) turns destination ids into names.
 */
export function tradeoffs(c, placeName = (id) => id) {
  const pros = [];
  const cons = [];
  const notes = [];
  if (!c) return { pros, cons, notes };

  const cost = c.cost?.delta || 0;
  if (cost < 0) pros.push(`Costs about ${pkr(-cost)} less (estimate)`);
  if (cost > 0) cons.push(`Costs about ${pkr(cost)} more (estimate)`);
  const biggest = [...(c.cost?.by_category || [])].filter((x) => x.delta).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  if (biggest && cost) notes.push(`The cost changes mostly in ${CATEGORY[biggest.category] || biggest.category}: ${biggest.delta > 0 ? '+' : '−'}${pkr(Math.abs(biggest.delta))}.`);

  const [a, b] = c.budget_status || [];
  if (a && b && a !== b) {
    if (b === 'within') pros.push('Fits the budget (estimate)');
    else if (a === 'within') cons.push('No longer fits the budget (estimate)');
  }

  const drive = c.time?.delta?.[1] || 0;
  if (drive < 0) pros.push(`Up to ${hours(drive)} less on the move`);
  if (drive > 0) cons.push(`Up to ${hours(drive)} more on the move`);

  const risk = c.risk?.delta;
  if (risk < 0) pros.push(`Lower risk score: ${c.risk.original} → ${c.risk.simulated} out of 100 (heuristic)`);
  if (risk > 0) cons.push(`Higher risk score: ${c.risk.original} → ${c.risk.simulated} out of 100 (heuristic)`);

  const gone = (c.destinations?.removed || []).map(placeName);
  const added = (c.destinations?.added || []).map(placeName);
  if (gone.length) cons.push(`Skips ${list(gone)}`);
  if (added.length) pros.push(`Adds ${list(added)}`);

  const days = c.length?.delta || 0;
  if (days) notes.push(`${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days > 0 ? 'longer' : 'shorter'} in total.`);
  if (c.days_changed) notes.push(`${c.days_changed} of ${c.days.length} days are different.`);
  const [t0, t1] = c.route?.transport || [];
  if (t0 && t1 && t0 !== t1) notes.push(`Transport changes from ${TRANSPORT[t0] || t0} to ${TRANSPORT[t1] || t1}.`);

  const co2 = c.eco?.delta?.[1];
  if (co2 < 0) pros.push('Lower transport emissions (estimate)');
  if (co2 > 0) cons.push('Higher transport emissions (estimate)');
  return { pros, cons, notes };
}
