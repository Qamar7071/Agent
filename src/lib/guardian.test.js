import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, dayCategories, tripCategories } from './guardian.js';

// From a real Guardian check of the demo trip (no live forecast that day).
const days = [
  { day: 1, factors: [{ factor: 'winter_conditions', points: 5 }] },
  { day: 2, factors: [] },
  { day: 4, factors: [{ factor: 'high_altitude', points: 10 }, { factor: 'winter_conditions', points: 5 }] },
  { day: 5, factors: [{ factor: 'long_drive', points: 4 }, { factor: 'after_dark', points: 6.5 }, { factor: 'official_alert', points: 25 }] },
];

test('factors fall into plain categories, biggest first', () => {
  assert.equal(categoryOf('after_dark'), 'timing');
  assert.equal(categoryOf('seasonal_closure'), 'road');
  assert.equal(categoryOf('something_new'), 'environment');
  const d4 = dayCategories(days[2]);
  assert.deepEqual(d4.map((c) => [c.key, c.points]), [['altitude', 10], ['environment', 5]]);
  const d5 = dayCategories(days[3]);
  assert.deepEqual(d5.map((c) => [c.key, c.points]), [['weather', 25], ['timing', 10.5]]);
  assert.deepEqual(dayCategories(days[1]), []);
});

test('the trip view totals each category and lists the days it touches', () => {
  const t = Object.fromEntries(tripCategories(days).map((c) => [c.key, c]));
  assert.equal(t.environment.points, 10);
  assert.deepEqual(t.environment.days, [1, 4]);
  assert.equal(t.altitude.points, 10);
  assert.equal(t.road.points, 0);
  assert.deepEqual(t.road.days, []);
  assert.equal(tripCategories(null).length, 5);
});
