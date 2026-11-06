import test from 'node:test';
import assert from 'node:assert/strict';
import { planToText } from './planText.js';

const plan = {
  title: 'Hunza Valley',
  request: { origin: 'Islamabad', adults: 2, children: 1 },
  budget: { total: 276100, per_person: 92000 },
  days: [
    { day: 1, date: '2026-11-13', title: 'Islamabad → Chilas', moves: [{ from_name: 'Islamabad', to_name: 'Chilas', time_label: '10–12 h', mode: 'drive' }], overnight: { name: 'Chilas' } },
    { day: 2, title: 'Karimabad & the forts', activities: ['Baltit Fort', 'Altit Fort'], moves: [], overnight: { name: 'Karimabad (Hunza)' } },
    { day: 3, title: 'Attabad Lake', activities_auto: true, activities: ['x'], moves: [{ from_name: 'Karimabad', to_name: 'Attabad', time_label: '1 h', mode: 'drive', round_trip: true }] },
  ],
};

test('a plan becomes readable text with costs labelled as estimates and the road caveat', () => {
  const t = planToText(plan, { site: 'https://raahi.example' });
  assert.match(t, /^Hunza Valley: 3 days from Islamabad, 3 people/);
  assert.match(t, /Estimated cost: Rs 2,76,100 \(Rs 92,000 per person\)\. An estimate, not a quote\./);
  assert.match(t, /Day 1 \(Fri 13 Nov\): Islamabad → Chilas\n {2}Islamabad to Chilas, 10–12 h by road\n {2}Night in Chilas/);
  assert.match(t, /Day 2: Karimabad & the forts\n {2}Baltit Fort; Altit Fort/);
  assert.match(t, /Day trip from Karimabad, 1 h each way by road/);
  assert.ok(!t.includes('  x'), 'automatic activities are not repeated');
  assert.match(t, /Road status could not be verified/);
  assert.match(t, /Planned with Raahi: https:\/\/raahi\.example$/);
  assert.equal(planToText(null), '');
});
