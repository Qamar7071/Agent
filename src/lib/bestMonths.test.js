// Unit tests for the best month advisor, with the real guide data.
// Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advise, monthTable, runsOf } from './bestMonths.js';

const data = JSON.parse(readFileSync(new URL('../../shared/destinations.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(data.destinations.map((d) => [d.id, d]));
const ROUTE = { khunjerab: 'khunjerab-pass', deosai: 'deosai-road', 'fairy-meadows': 'fairy-meadows-track' };
// the same rule as seasonFit in data.js
function fit(id, month) {
  const route = data.seasonal_routes.find((r) => r.id === ROUTE[id]);
  if (route && !route.typical_open_months.includes(month)) return 'closed';
  return byId[id].best_months.includes(month) ? 'best' : 'possible';
}

test('a month suits a set of places only when it is a best month for every one of them', () => {
  const { best, table } = advise(['skardu', 'deosai'], fit);
  assert.ok(best.length > 0);
  for (const m of best) {
    assert.ok(byId.skardu.best_months.includes(m) && byId.deosai.best_months.includes(m));
    assert.equal(table[m - 1].closed.length, 0);
  }
  for (let m = 1; m <= 12; m += 1) {
    if (!best.includes(m)) assert.ok(!byId.skardu.best_months.includes(m) || !byId.deosai.best_months.includes(m) || fit('deosai', m) === 'closed');
  }
});

test('a month when a seasonal road is usually closed is flagged, never suggested', () => {
  const winter = advise(['hunza', 'khunjerab'], fit, 1);
  assert.deepEqual(winter.closedIn, ['khunjerab']);
  assert.equal(winter.chosen.verdict, 'closed');
  assert.ok(!winter.best.includes(1) && !winter.fallback.includes(1));
});

test('when no month suits every place, the fallback avoids closed months', () => {
  const fake = (id, m) => (id === 'a' ? (m <= 6 ? 'best' : 'possible') : m >= 7 ? 'best' : m === 1 ? 'closed' : 'possible');
  const r = advise(['a', 'b'], fake);
  assert.deepEqual(r.best, []);
  assert.equal(r.fallback.length, 11);
  assert.ok(!r.fallback.includes(1));
});

test('runs of months, wrapping over the new year', () => {
  assert.deepEqual(runsOf([6, 7, 8, 9]), [[6, 7, 8, 9]]);
  assert.deepEqual(runsOf([11, 12, 1, 2]), [[11, 12, 1, 2]]);
  assert.deepEqual(runsOf([4, 5, 9, 10]), [[4, 5], [9, 10]]);
  assert.deepEqual(runsOf([]), []);
  assert.equal(runsOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])[0].length, 12);
  assert.equal(monthTable([], fit)[0].verdict, 'none');
});
