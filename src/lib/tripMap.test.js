// Unit tests for the trip map data, with the real guide's place points.
// Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_COLORS, dayColor, directionsUrl, mapModel, nightsLabel } from './tripMap.js';

const data = JSON.parse(readFileSync(new URL('../../shared/destinations.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(data.destinations.map((d) => [d.id, d]));
const point = (k) => (data.hubs[k] ? { lat: data.hubs[k].lat, lng: data.hubs[k].lng } : byId[k]?.coords ? { lat: byId[k].coords.lat, lng: byId[k].coords.lng } : null);
const name = (k) => byId[k]?.name || k;

// The shape of a planner day (see backend/planner.py): Islamabad, Chilas, Hunza, Sost, Khunjerab day trip, back.
const days = [
  { day: 1, type: 'travel', title: 'Islamabad to Chilas', moves: [{ from: 'islamabad', to: 'chilas', mode: 'drive' }], overnight: { hub: 'chilas' } },
  { day: 2, type: 'travel', title: 'Chilas to Hunza', moves: [{ from: 'chilas', to: 'hunza', mode: 'drive' }], overnight: { hub: 'hunza' } },
  { day: 3, type: 'stay', title: 'Hunza', destination_id: 'hunza', moves: [], overnight: { hub: 'hunza' } },
  { day: 4, type: 'travel', title: 'To Sost', moves: [{ from: 'hunza', to: 'sost', mode: 'drive' }], overnight: { hub: 'sost' } },
  { day: 5, type: 'daytrip', title: 'Khunjerab', destination_id: 'khunjerab', moves: [{ from: 'sost', to: 'khunjerab', mode: 'drive' }, { from: 'khunjerab', to: 'sost', mode: 'drive' }], overnight: { hub: 'sost' } },
  { day: 6, type: 'travel', title: 'Home', moves: [{ from: 'sost', to: 'mars', mode: 'drive' }], overnight: null },
];

test('segments follow the moves, and unknown places are left out rather than guessed', () => {
  const m = mapModel(days, point, name);
  assert.deepEqual(m.segments.map((s) => `${s.day}:${s.from}>${s.to}`),
    ['1:islamabad>chilas', '2:chilas>hunza', '4:hunza>sost', '5:sost>khunjerab', '5:khunjerab>sost']);
  assert.equal(m.days.find((d) => d.day === 6).moves, 0);
});

test('stops know their nights, and the trip starts at home', () => {
  const m = mapModel(days, point, name);
  const by = Object.fromEntries(m.stops.map((s) => [s.key, s]));
  assert.ok(by.islamabad.start);
  assert.deepEqual(by.hunza.nights, [2, 3]);
  assert.deepEqual(by.sost.nights, [4, 5]);
  assert.deepEqual(by.khunjerab.nights, []);
  assert.deepEqual(by.khunjerab.visits, [5]);
  assert.equal(nightsLabel(by.hunza.nights), '2–3');
  assert.equal(nightsLabel([1, 2, 4, 6, 7]), '1–2, 4, 6–7');
  const [[s, w], [n, e]] = m.bounds;
  assert.ok(s < n && w < e && n > 36.5, 'bounds reach up to Khunjerab');
});

test('a stay day points at its town, and day colours repeat after ten days', () => {
  const m = mapModel(days, point, name);
  assert.equal(m.days[2].points.length, 1);
  assert.equal(dayColor(1), DAY_COLORS[0]);
  assert.equal(dayColor(11), DAY_COLORS[0]);
});

test('directions go through every point of the day', () => {
  const m = mapModel(days, point, name);
  const url = new URL(directionsUrl(m.days[4].points));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.equal(url.searchParams.get('origin'), url.searchParams.get('destination'));   // there and back
  assert.ok(url.searchParams.get('waypoints'));
  assert.equal(directionsUrl([m.days[0].points[0]]), null);
});
