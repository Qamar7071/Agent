import test from 'node:test';
import assert from 'node:assert/strict';
import { outboundOf, shapeOf, typicalDays } from './tripFacts.js';

const move = (from, to, mode, km, hours, extra = {}) => ({ from, to, to_name: to[0].toUpperCase() + to.slice(1), mode, km, hours, ...extra });

const hunza = { days: [
  { day: 1, type: 'travel', moves: [move('islamabad', 'chilas', 'drive', 460, [10, 12])] },
  { day: 2, type: 'travel', moves: [move('chilas', 'hunza', 'drive', 230, [5.5, 7])] },
  { day: 3, type: 'stay', moves: [] },
  { day: 4, type: 'daytrip', moves: [move('hunza', 'attabad', 'drive', 30, [1, 1.5], { round_trip: true })] },
  { day: 5, type: 'stay', moves: [] },
  { day: 6, type: 'travel', moves: [move('hunza', 'chilas', 'drive', 230, [5.5, 7])] },
  { day: 7, type: 'travel', moves: [move('chilas', 'islamabad', 'drive', 460, [10, 12])] },
] };

test('the journey there is the first half of the one-way moves, ignoring day trips', () => {
  const o = outboundOf(hunza);
  assert.equal(o.km, 690);
  assert.deepEqual(o.hours, [15.5, 19]);
  assert.equal(o.days, 2);
  assert.deepEqual(o.modes, ['drive']);
  assert.deepEqual(o.via, ['Chilas']);
  assert.equal(o.flight, false);
});

test('a jeep leg on an exploring day still counts, and odd counts round up', () => {
  const fairy = { days: [
    { day: 1, type: 'travel', moves: [move('islamabad', 'chilas', 'drive', 460, [10, 12])] },
    { day: 2, type: 'stay', moves: [move('chilas', 'fairy-meadows', 'jeep', 65, [4.5, 7])] },
    { day: 3, type: 'stay', moves: [] },
    { day: 4, type: 'travel', moves: [move('fairy-meadows', 'chilas', 'jeep', 65, [4.5, 7])] },
    { day: 5, type: 'travel', moves: [move('chilas', 'islamabad', 'drive', 460, [10, 12])] },
  ] };
  const o = outboundOf(fairy);
  assert.equal(o.km, 525);
  assert.deepEqual(o.hours, [14.5, 19]);
  assert.deepEqual(o.modes, ['drive', 'jeep']);
  const odd = outboundOf({ days: [{ day: 1, moves: [move('a', 'b', 'flight', 0, [1, 2]), move('b', 'c', 'drive', 100, [2, 3]), move('c', 'a', 'drive', 100, [2, 3])] }] });
  assert.equal(odd.flight, true);
  assert.equal(odd.km, 100);
});

test('shape, typical days and empty plans', () => {
  assert.deepEqual(shapeOf(hunza), { total: 7, travel: 4, there: 3 });
  assert.equal(outboundOf({ days: [] }), null);
  assert.equal(outboundOf(null), null);
  assert.equal(typicalDays({ recommended_days: { default: 3 } }), 7);
  assert.equal(typicalDays({ recommended_days: { default: 14 } }), 18);
  assert.equal(typicalDays(undefined), 6);
});
