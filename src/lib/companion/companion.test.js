// Unit tests for the companion's deterministic logic. Run: npm run test:unit (node --test).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lakh, pkr, pkrRange } from '../format.js';
import { evaluate, candidates, altSavings, MAX_PER_DAY } from './nudges.js';
import { addDays, dayCost, pace, plannedDays, tripDay } from './pace.js';
import { balances, settle, shares, summary } from './split.js';

// A 5-day plan: day 1 and 5 are drive days (transport heavy), days 2–4 sightseeing.
const DAYS = [
  { day: 1, cost: { transport: 20000, accommodation: 10000, food: 5000, activities: 0, guide: 0 } },
  { day: 2, cost: { transport: 5000, accommodation: 10000, food: 5000, activities: 5000, guide: 0 } },
  { day: 3, cost: { transport: 5000, accommodation: 10000, food: 5000, activities: 5000, guide: 0 } },
  { day: 4, cost: { transport: 5000, accommodation: 10000, food: 5000, activities: 5000, guide: 0 } },
  { day: 5, cost: { transport: 35000, accommodation: 0, food: 5000, activities: 0, guide: 0 } },
]; // plan total 1,50,000; cumulative 35k, 60k, 85k, 110k, 150k
const ALT_STAY = { id: 'stay_down', days: DAYS.map((d) => ({ day: d.day, cost: { ...d.cost, accommodation: d.cost.accommodation / 2 } })) };
const planned = plannedDays(DAYS);
let seq = 0;
const ex = (amountPkr, dayIndex, extra = {}) => ({ id: `e${(seq += 1)}`, amountPkr, dayIndex, category: 'food', paidBy: 'a',
  splitAmong: [], ...extra });

describe('money format', () => {
  it('uses lakh grouping', () => {
    assert.equal(pkr(150000), 'Rs 1,50,000');
    assert.equal(pkr(1500000), 'Rs 15,00,000');
    assert.equal(pkr(999), 'Rs 999');
    assert.equal(pkr(-2500), '-Rs 2,500');
    assert.equal(lakh(10000000), '1,00,00,000');
    assert.equal(pkrRange(7000, 18000), 'Rs 7,000–18,000');
  });
});

describe('trip days', () => {
  it('counts the trip day from the start date', () => {
    assert.equal(tripDay('2026-11-10', '2026-11-09', 5), 0);
    assert.equal(tripDay('2026-11-10', '2026-11-10', 5), 1);
    assert.equal(tripDay('2026-11-10', '2026-11-14', 5), 5);
    assert.equal(tripDay('2026-11-10', '2026-12-01', 5), 6);
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  });
  it('maps plan costs to companion categories', () => {
    assert.deepEqual(dayCost({ transport: 1, accommodation: 2, food: 3, activities: 4, guide: 5 }),
      { stay: 2, food: 3, transport: 1, activities: 9, total: 15 });
  });
});

describe('pace', () => {
  it('scales the plan shape to the group budget', () => {
    const p = pace({ planned, budgetTotal: 100000, expenses: [ex(30000, 1), ex(10000, 2)], dayIndex: 2 });
    assert.equal(p.plannedPct, 40);             // 60k of 150k planned by end of day 2
    assert.equal(p.plannedToDate, 40000);       // 40% of the 1,00,000 budget
    assert.equal(p.spentPct, 40);
    assert.equal(p.status, 'on_track');
    assert.equal(p.remaining, 60000);
  });
  it('marks careful above 15 points and over above 30', () => {
    assert.equal(pace({ planned, budgetTotal: 100000, expenses: [ex(57000, 2)], dayIndex: 2 }).status, 'careful');
    assert.equal(pace({ planned, budgetTotal: 100000, expenses: [ex(71000, 2)], dayIndex: 2 }).status, 'over');
    assert.equal(pace({ planned, budgetTotal: 100000, expenses: [ex(55000, 2)], dayIndex: 2 }).status, 'on_track');
  });
  it('tracks only, with no status, when there is no budget', () => {
    const p = pace({ planned, budgetTotal: null, expenses: [ex(90000, 1)], dayIndex: 1 });
    assert.equal(p.status, null);
    assert.equal(p.spentToDate, 90000);
    assert.equal(p.perDay[1], 90000);
  });
  it('counts money paid before the trip in step with the plan', () => {
    const hotel = ex(40000, 0, { category: 'stay' });       // all 4 nights paid in advance
    const before = pace({ planned, budgetTotal: 150000, expenses: [hotel], dayIndex: 0 });
    assert.equal(before.spentToDate, 0);                      // nothing used before the trip
    assert.equal(before.status, 'on_track');
    const day2 = pace({ planned, budgetTotal: 150000, expenses: [hotel], dayIndex: 2 });
    assert.equal(day2.spentToDate, 20000);                    // 2 of 4 nights
    assert.equal(day2.prepaidFuture, 20000);
    assert.equal(day2.remaining, 110000);                     // the cash itself is gone
  });
  it('ignores deleted expenses and applies accepted changes from their day', () => {
    const p = pace({ planned, budgetTotal: 100000, expenses: [ex(50000, 1, { deleted: true })], dayIndex: 1 });
    assert.equal(p.spentToDate, 0);
    const changed = plannedDays(DAYS, [ALT_STAY], [{ altId: 'stay_down', fromDay: 3 }]);
    assert.equal(changed[1].cost.stay, 10000);
    assert.equal(changed[2].cost.stay, 5000);
  });
});

describe('nudge rules', () => {
  const ctx = (expenses, dayIndex, budgetTotal = 100000, last = null) => {
    const p = pace({ planned, budgetTotal, expenses, dayIndex });
    return { p, planned, alternatives: [ALT_STAY], adjustments: [], lastExpense: last };
  };
  const rules = (c) => candidates(c).map((x) => x.ruleId);

  it('R1 fires above 15 points with careful, above 30 with over', () => {
    assert.ok(!rules(ctx([ex(55000, 2)], 2)).includes('R1'));
    const careful = candidates(ctx([ex(57000, 2)], 2)).find((x) => x.ruleId === 'R1');
    assert.equal(careful.severity, 'careful');
    const over = candidates(ctx([ex(72000, 2)], 2)).find((x) => x.ruleId === 'R1');
    assert.equal(over.severity, 'over');
    assert.deepEqual([over.facts.spentPct, over.facts.plannedPct], [72, 40]);
  });
  it('R1 options save from tomorrow and always include keeping the plan', () => {
    const r1 = candidates(ctx([ex(72000, 2)], 2)).find((x) => x.ruleId === 'R1');
    const alt = r1.options.find((o) => o.kind === 'stay_down');
    assert.equal(alt.action.fromDay, 3);
    assert.equal(alt.estSavingPkr, 10000);                  // days 3 and 4: 5,000 each, cost model
    assert.equal(alt.source, 'Raahi cost model (estimate)');
    assert.equal(r1.options.at(-1).kind, 'keep');
  });
  it('R2 fires when a category is above 110% of its share and the overrun is material', () => {
    // food planned to day 2 = 10,000 of 25,000 → scaled to a 1,00,000 budget: 6,667
    const food = (amt) => [ex(amt, 2, { category: 'food' })];
    assert.ok(!rules(ctx(food(7000), 2)).includes('R2'));       // only 5% above
    assert.ok(!rules(ctx(food(7400), 2)).includes('R2'));        // above 110%, but only Rs 733 over: not worth a nudge
    const r2 = candidates(ctx(food(12000), 2)).find((x) => x.ruleId === 'R2');
    assert.equal(r2.facts.category, 'food');
    assert.equal(r2.options[0].kind, 'cap');
    assert.ok(r2.options[0].perDayTarget > 0);
  });
  it('R3 fires when money left per day is under 80% of what the plan still needs', () => {
    const c = ctx([ex(60000, 3)], 3);          // planned 56,667 by day 3; need 43,333 for 2 days
    assert.ok(!rules(c).includes('R3'));
    const r3 = candidates(ctx([ex(70000, 3)], 3)).find((x) => x.ruleId === 'R3');
    assert.equal(r3.facts.perDayLeft, 15000);
    assert.equal(r3.facts.daysLeft, 2);
  });
  it('R4 checks a single expense above 20% of that day', () => {
    const big = ex(9000, 2);                    // day 2 plan scaled: 25,000 × 100k/150k = 16,667 → 20% = 3,333
    const r4 = candidates(ctx([big], 2, 100000, big)).find((x) => x.ruleId === 'R4');
    assert.equal(r4.severity, 'info');
    assert.equal(r4.options[1].action.type, 'edit_expense');
    const small = ex(3000, 2);
    assert.ok(!rules(ctx([small], 2, 100000, small)).includes('R4'));
  });
  it('shows no pace warnings without a budget or before the trip', () => {
    assert.deepEqual(rules(ctx([ex(90000, 1)], 1, null)).filter((r) => r !== 'R4'), []);
    assert.deepEqual(rules(ctx([ex(90000, 0)], 0)), []);
  });
  it('limits: at most 2 a day, each rule at most once in 24 hours', () => {
    const now = new Date('2026-11-12T10:00:00').getTime();
    const c = { ...ctx([ex(120000, 2, { category: 'food' })], 2), now };
    const first = evaluate({ ...c, history: [] });
    assert.equal(first.length, MAX_PER_DAY);
    assert.equal(evaluate({ ...c, history: first }).length, 0);
    const yesterday = first.map((n) => ({ ...n, createdAt: new Date(now - 20 * 3600e3).toISOString() }));
    const later = evaluate({ ...c, history: yesterday });
    assert.ok(later.every((n) => !first.some((f) => f.ruleId === n.ruleId)));  // same rules still blocked
  });
  it('never offers a saving of zero or a change already accepted', () => {
    const none = altSavings({ planned, alternatives: [ALT_STAY], adjustments: [{ altId: 'stay_down', fromDay: 2 }], fromDay: 3 });
    assert.deepEqual(none, []);
    assert.deepEqual(altSavings({ planned, alternatives: [ALT_STAY], fromDay: 5 }), []);   // no stay left to save on
  });
});

describe('group split', () => {
  const members = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), active: true }));
  it('splits in whole rupees and the shares add up to the amount', () => {
    const s = shares({ id: 'x', amountPkr: 1000, splitAmong: [] }, ['a', 'b', 'c']);
    assert.equal(Object.values(s).reduce((t, v) => t + v, 0), 1000);
    assert.deepEqual(Object.values(s).sort(), [333, 333, 334]);
  });
  it('balances always reconcile to exactly zero', () => {
    for (let t = 0; t < 200; t += 1) {
      const list = Array.from({ length: 1 + (t % 9) }, (_, i) => ({ id: `t${t}-${i}`, amountPkr: 1 + ((t * 7919 + i * 104729) % 99999),
        paidBy: members[(t + i) % 3].id, splitAmong: i % 2 ? ['a', 'c'] : [] }));
      const { totalNet, payments, balances: b } = summary(list, members);
      assert.equal(totalNet, 0);
      const after = Object.fromEntries(b.map((x) => [x.id, x.net]));
      for (const p of payments) { after[p.from] += p.amount; after[p.to] -= p.amount; }
      assert.ok(Object.values(after).every((v) => v === 0));
    }
  });
  it('settles with the fewest payments', () => {
    // a +50, b +30, c −50, d −30: greedy pairs a↔c and b↔d anyway; the tricky case is below.
    const bals = [{ id: 'a', net: 4 }, { id: 'b', net: 3 }, { id: 'c', net: -3 }, { id: 'd', net: -2 }, { id: 'e', net: -2 }];
    const pays = settle(bals);
    assert.equal(pays.length, 3);               // {a,d,e} and {b,c} cancel separately: 5 − 2 groups
    const greedyWouldUse = 4;
    assert.ok(pays.length < greedyWouldUse);
  });
  it('a member who left keeps their balance until settled', () => {
    const left = [...members, { id: 'z', name: 'Z', active: false }];
    const b = balances([{ id: 'q', amountPkr: 400, paidBy: 'z', splitAmong: ['a', 'b', 'c', 'z'] }], left);
    assert.equal(b.find((x) => x.id === 'z').net, 300);
    assert.equal(b.reduce((s, x) => s + x.net, 0), 0);
  });
  it('ignores deleted expenses and unknown payers', () => {
    const b = balances([{ id: 'd', amountPkr: 900, paidBy: 'a', deleted: true }, { id: 'u', amountPkr: 900, paidBy: 'nobody' }], members);
    assert.ok(b.every((x) => x.net === 0));
  });
});
