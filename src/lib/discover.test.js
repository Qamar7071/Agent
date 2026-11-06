import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterDestinations, matches, normalise } from './discover.js';

const data = JSON.parse(readFileSync(new URL('../../shared/destinations.json', import.meta.url), 'utf8'));
const list = data.destinations;
const byId = Object.fromEntries(list.map((d) => [d.id, d]));
const ROUTE = { khunjerab: 'khunjerab-pass', deosai: 'deosai-road', 'fairy-meadows': 'fairy-meadows-track' };
const seasonFit = (id, month) => {
  const r = data.seasonal_routes.find((x) => x.id === ROUTE[id]);
  if (r && !r.typical_open_months.includes(month)) return 'closed';
  return byId[id].best_months.includes(month) ? 'best' : 'possible';
};
const ids = (xs) => xs.map((d) => d.id);

test('search finds places by name, alias, highlight and region, ignoring case and accents', () => {
  assert.equal(normalise('Eagle’s  Nest!'), 'eagles nest');
  assert.ok(matches(byId.hunza, 'eagles nest'));
  assert.ok(matches(byId.hunza, 'BALTIT'));
  assert.ok(matches(byId['fairy-meadows'], 'nanga parbat'));
  assert.ok(matches(byId.skardu, 'baltistan'));
  assert.ok(!matches(byId.hunza, 'deosai'));
  assert.deepEqual(ids(filterDestinations(list, { query: 'lake' })).includes('attabad'), true);
  // every word must match
  assert.deepEqual(ids(filterDestinations(list, { query: 'fort hunza' })), ['hunza']);
  assert.deepEqual(filterDestinations(list, { query: 'zzzz' }), []);
});

test('kinds of place filter with OR, and an empty filter keeps the curated order', () => {
  assert.deepEqual(ids(filterDestinations(list, {})), ids(list));
  const high = filterDestinations(list, { categories: ['high'] });
  assert.ok(high.length >= 2 && high.every((d) => d.category.includes('high')));
  const two = filterDestinations(list, { categories: ['lakes', 'treks'] });
  assert.ok(two.every((d) => d.category.includes('lakes') || d.category.includes('treks')));
});

test('a month puts places usually closed then last; other sorts work', () => {
  const jan = filterDestinations(list, { month: 1, seasonFit });
  const fits = jan.map((d) => seasonFit(d.id, 1));
  assert.deepEqual([...fits].sort((a, b) => ['best', 'possible', 'closed'].indexOf(a) - ['best', 'possible', 'closed'].indexOf(b)), fits);
  assert.equal(seasonFit(jan.at(-1).id, 1), 'closed');
  const alt = filterDestinations(list, { sort: 'altitude' });
  assert.equal(alt[0].id, 'k2');
  for (let i = 1; i < alt.length; i += 1) assert.ok(alt[i - 1].altitude_m >= alt[i].altitude_m);
  const days = filterDestinations(list, { sort: 'days' });
  assert.ok(days.at(-1).id === 'k2');
});
