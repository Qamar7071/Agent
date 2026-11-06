import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duration, progress, rerunBy, stageName, stagesOf } from './pipeline.js';

const recorded = JSON.parse(readFileSync(new URL('../data/demo-run.json', import.meta.url), 'utf8')).run;

test('the recorded run becomes its real stages, in dependency order', () => {
  const stages = stagesOf(recorded.tasks);
  assert.deepEqual(stages.map((s) => s.name), ['Request', 'Understand', 'Research', 'Plan', 'Check', 'Assess', 'Validate']);
  const ids = (name) => stages.find((s) => s.name === name).tasks.map((t) => t.agent).sort();
  assert.deepEqual(ids('Check'), ['accommodation', 'budget', 'eco', 'route', 'weather']);
  assert.deepEqual(ids('Assess'), ['packing', 'safety']);
  // every task appears exactly once, and always after everything it depended on
  const where = Object.fromEntries(stages.flatMap((s) => s.tasks.map((t) => [t.id, s.index])));
  assert.equal(Object.keys(where).length, recorded.tasks.length);
  for (const t of recorded.tasks) for (const d of t.depends_on) assert.ok(where[d] < where[t.id], `${d} before ${t.id}`);
});

test('a retry asked for by Validation comes after Validation, not hidden in the first pass', () => {
  const tasks = [
    { id: 'o', agent: 'orchestrator', depends_on: [], initiated_by: 'user' },
    { id: 'i', agent: 'itinerary', depends_on: [], initiated_by: 'o' },
    { id: 'w1', agent: 'weather', depends_on: ['i'], initiated_by: 'o', status: 'completed' },
    { id: 'v1', agent: 'validation', depends_on: ['i', 'w1'], initiated_by: 'o' },
    { id: 'w2', agent: 'weather', depends_on: ['i'], initiated_by: 'v1', status: 'completed' },
    { id: 'v2', agent: 'validation', depends_on: ['i', 'w2'], initiated_by: 'o' },
  ];
  const stages = stagesOf(tasks);
  const at = Object.fromEntries(stages.flatMap((s) => s.tasks.map((t) => [t.id, s.index])));
  assert.ok(at.w2 > at.v1 && at.v2 > at.w2 && at.w1 < at.v1);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  assert.equal(rerunBy(byId.w2, byId).id, 'v1');
  assert.equal(rerunBy(byId.w1, byId), null);
});

test('progress, durations, names, and bad input', () => {
  const p = progress(recorded.tasks);
  assert.equal(p.total, 12);
  assert.equal(p.done, 12);
  assert.equal(p.failed, 0);
  assert.ok(p.tools >= 12);
  assert.equal(duration(7), '7 ms');
  assert.equal(duration(895), '895 ms');
  assert.equal(duration(8948), '8.9 s');
  assert.equal(duration(12400), '12 s');
  assert.equal(duration(undefined), '');
  assert.equal(stageName([{ agent: 'twin' }]), 'Copy');
  assert.equal(stageName([{ agent: 'mystery' }]), 'Step');
  assert.deepEqual(stagesOf(null), []);
  // a cycle in bad data must not hang
  const loop = stagesOf([{ id: 'a', agent: 'x', depends_on: ['b'] }, { id: 'b', agent: 'y', depends_on: ['a'] }]);
  assert.equal(loop.flatMap((s) => s.tasks).length, 2);
});
