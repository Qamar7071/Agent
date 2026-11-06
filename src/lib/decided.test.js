// Unit tests for the "how the agents decided" helpers, against the recorded real run.
// Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  agentName, answers, finalDecision, latestWithMessages, messagesFromEvents, messagesOf, offsets, playbackDelays,
  stats, stepLink,
} from './decided.js';

const recorded = JSON.parse(readFileSync(new URL('../data/demo-run.json', import.meta.url), 'utf8'));
const run = recorded.run;
const byId = Object.fromEntries(run.tasks.map((t) => [t.id, t]));

test('the recorded demo is a real run, clearly labelled', () => {
  assert.equal(recorded.label, 'Recorded run');
  assert.match(recorded.note, /not live/i);
  assert.ok(run.id && run.tasks.length >= 10 && run.events.length > 0);
  assert.match(recorded.message, /10-day.*Skardu.*Islamabad.*5 friends/i);
});

test('every message belongs to a real step of its run and carries its run id', () => {
  const msgs = messagesOf(run);
  assert.ok(msgs.length >= 8);
  for (const m of msgs) {
    assert.ok(byId[m.step], `message ${m.id} points at a missing step ${m.step}`);
    assert.equal(m.runId, run.id);
    assert.equal(byId[m.step].agent, m.agent);
    assert.ok(['proposal', 'concern', 'decision'].includes(m.type));
  }
  // and every message was emitted as an execution event (the conversation is the log, not a script)
  const fromLog = messagesFromEvents(run.events).map((m) => m.id);
  assert.deepEqual(fromLog, msgs.map((m) => m.id));
});

test('replies point back to the concern they answer', () => {
  const msgs = messagesOf(run);
  const a = answers(msgs);
  const over = msgs.find((m) => m.type === 'concern' && m.agent === 'budget');
  assert.ok(over, 'the recorded run has a budget concern');
  assert.ok(a[over.id]?.length >= 1, 'someone answers the budget concern');
  for (const id of a[over.id]) {
    const reply = msgs.find((m) => m.id === id);
    assert.ok(msgs.indexOf(reply) > msgs.indexOf(over), 'a reply comes after the concern');
  }
});

test('the conversation ends with the validation decision, and the stats add up', () => {
  const msgs = messagesOf(run);
  const d = finalDecision(msgs);
  assert.equal(d.agent, 'validation');
  const s = stats(msgs);
  assert.equal(s.total, msgs.length);
  assert.equal(s.proposals + s.concerns + s.decisions, s.total);
  assert.ok(s.answered >= 1 && s.answered <= s.concerns);
  assert.ok(s.agents >= 8);
});

test('message timing comes from the run log, and playback stays readable', () => {
  const ms = offsets(run);
  const msgs = messagesOf(run);
  assert.equal(Object.keys(ms).length, msgs.length);
  const times = msgs.map((m) => ms[m.id]);
  assert.deepEqual([...times].sort((x, y) => x - y), times, 'messages are in time order');
  const delays = playbackDelays(run);
  assert.equal(delays.length, msgs.length);
  assert.ok(delays.every((d) => d >= 450 && d <= 1400));
});

test('names, links and missing data', () => {
  const m = messagesOf(run)[0];
  assert.equal(agentName(m, byId), byId[m.step].label);
  assert.equal(agentName({ agent: 'budget', step: 'x' }, {}), 'Budget');
  assert.equal(stepLink('abc', 'budget-7'), '/agents?run=abc&task=budget-7');
  assert.equal(stepLink(null, null), '/agents?run=recorded');
  assert.deepEqual(messagesOf({}), []);
  assert.deepEqual(messagesOf({ messages: [{ id: 'm1', type: 'chat', summary: 'x' }] }), []);
  assert.deepEqual(messagesFromEvents([{ type: 'message', message: 'text' }, null, { type: 'started' }]), []);
  assert.equal(latestWithMessages([{ id: 'a', messages: [] }, run]).id, run.id);
  assert.equal(latestWithMessages([]), null);
  assert.equal(finalDecision([]), null);
});

test('decision cards: stake, recommendation, what else was considered, and who decides', async () => {
  const { decisionCards } = await import('./decided.js');
  const msgs = [
    { id: 'm1', step: 'budget-7', agent: 'budget', type: 'concern', summary: 'Estimate Rs 9,04,200: about Rs 4,04,200 over budget.', evidence: [{ source: 'Raahi cost model (estimate)', detail: 'lines' }] },
    { id: 'm2', step: 'budget-7', agent: 'budget', type: 'proposal', summary: 'The fewest changes that fit: budget stays and public coaches.', resolvesEventId: 'm1', evidence: [{ source: 'Budget search', detail: '8 versions tried' }] },
    { id: 'm3', step: 'budget-7', agent: 'budget', type: 'proposal', summary: 'Also priced: public coaches Rs 6,18,200 (−Rs 2,86,000).', evidence: [{ source: 'Raahi cost model (estimate)', detail: 'lines' }] },
    { id: 'm4', step: 'weather-5', agent: 'weather', type: 'concern', summary: 'Day 3: heavy rain.', reason: 'Bad-weather idea: forts' },
    { id: 'm5', step: 'validation-12', agent: 'validation', type: 'decision', summary: 'Your choice is needed: about Rs 4,04,200 over budget.', resolvesEventId: 'm1', reason: 'Options: Apply the cheapest changes that fit' },
  ];
  const cards = decisionCards(msgs);
  assert.equal(cards.length, 2);
  const [budget, weather] = cards;
  assert.equal(budget.stake.id, 'm1');
  assert.equal(budget.recommendation.id, 'm2');
  assert.deepEqual(budget.considered.map((m) => m.id), ['m3']);
  assert.equal(budget.decision.id, 'm5');
  assert.equal(budget.yours, true);
  assert.equal(budget.evidence.length, 2, 'the same evidence is listed once');
  assert.equal(weather.kind, 'noted');
  assert.equal(weather.recommendation, null);
  // a run that ends in a plain decision gets a card for it
  const plain = decisionCards([{ id: 'x', step: 'validation-1', agent: 'validation', type: 'decision', summary: '9 of 10 checks passed: pass. The plan can go to you.' }]);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].kind, 'final');
  assert.equal(plain[0].yours, false);
  assert.deepEqual(decisionCards(null), []);
});

test('the recorded run gives a budget decision that is the traveller’s to make', async () => {
  const { decisionCards, messagesOf } = await import('./decided.js');
  const { readFileSync } = await import('node:fs');
  const rec = JSON.parse(readFileSync(new URL('../data/demo-run.json', import.meta.url), 'utf8'));
  const cards = decisionCards(messagesOf(rec.run));
  assert.ok(cards.length >= 1);
  assert.equal(cards[0].yours, true);
  assert.match(cards[0].stake.summary, /over your budget/);
  assert.ok(cards[0].recommendation && cards[0].decision);
});
