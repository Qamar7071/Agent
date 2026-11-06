import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeoffs } from './twin.js';

// The real comparison for "Khunjerab route unavailable from day 4" on the demo trip.
const khunjerab = {
  days: [{ status: 'same' }, { status: 'same' }, { status: 'changed' }, { status: 'changed' }, { status: 'changed' }],
  days_changed: 3,
  length: { original: 5, simulated: 5, delta: 0 },
  cost: { original: 280700, simulated: 316800, delta: 36100, by_category: [
    { category: 'accommodation', delta: 28000 }, { category: 'activities', delta: 4800 }, { category: 'food', delta: 0 }] },
  time: { original: [12.5, 15.5], simulated: [5, 6], delta: [-7.5, -9.5], road_km_delta: -330 },
  route: { removed: ['khunjerab-pass'], added: [], transport: ['car', 'car'] },
  destinations: { removed: ['khunjerab'], added: [] },
  risk: { original: 15, simulated: 5, delta: -10, categories: ['Low', 'Low'] },
  budget_status: ['over', 'over'],
};

test('a closed road: less driving and lower risk, but dearer and it skips the pass', () => {
  const t = tradeoffs(khunjerab, (id) => ({ khunjerab: 'Khunjerab Pass' }[id] || id));
  assert.deepEqual(t.pros, ['Up to 9.5 h less on the move', 'Lower risk score: 15 → 5 out of 100 (heuristic)']);
  assert.deepEqual(t.cons, ['Costs about Rs 36,100 more (estimate)', 'Skips Khunjerab Pass']);
  assert.deepEqual(t.notes, ['The cost changes mostly in stays: +Rs 28,000.', '3 of 5 days are different.']);
});

test('a cheaper scenario that now fits, with a transport change and an extra day', () => {
  const t = tradeoffs({
    days: [{}, {}, {}], days_changed: 1, length: { delta: 1 },
    cost: { delta: -20000, by_category: [{ category: 'transport', delta: -26000 }, { category: 'food', delta: 6000 }] },
    time: { delta: [2, 3] }, route: { transport: ['car', 'bus'] }, destinations: { removed: [], added: ['attabad'] },
    budget_status: ['over', 'within'], eco: { delta: [-40, -60] },
  });
  assert.ok(t.pros.includes('Costs about Rs 20,000 less (estimate)'));
  assert.ok(t.pros.includes('Fits the budget (estimate)'));
  assert.ok(t.pros.includes('Adds attabad'));
  assert.ok(t.pros.includes('Lower transport emissions (estimate)'));
  assert.ok(t.cons.includes('Up to 3 h more on the move'));
  assert.ok(t.notes.includes('1 day longer in total.'));
  assert.ok(t.notes.includes('Transport changes from a hired car to public coaches.'));
  assert.deepEqual(tradeoffs(null), { pros: [], cons: [], notes: [] });
});
