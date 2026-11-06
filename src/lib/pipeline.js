// A run's agents as stages, worked out from the run's own records: each task sits one stage
// after everything it depended on, and a task that another agent asked to run again (for
// example Validation asking Weather to retry) sits after that agent, so a retry loop shows in
// the order it really happened. Pure functions, unit-tested with node --test.

export const STATUS_DONE = ['completed', 'skipped', 'waiting_for_approval'];

// The name of a stage, from the first agent in it in this order of meaning.
const STAGE_NAMES = [
  ['orchestrator', 'Request'], ['memory', 'Understand'], ['twin', 'Copy'], ['research', 'Research'],
  ['itinerary', 'Plan'], ['weather', 'Check'], ['route', 'Check'], ['budget', 'Check'], ['accommodation', 'Check'],
  ['eco', 'Check'], ['safety', 'Assess'], ['packing', 'Assess'], ['guardian', 'Assess'], ['comparison', 'Compare'],
  ['validation', 'Validate'],
];

export function stageName(tasks) {
  const agents = new Set(tasks.map((t) => t.agent));
  for (const [agent, name] of STAGE_NAMES) if (agents.has(agent)) return name;
  return 'Step';
}

/** Parents of a task: what it depended on, plus the agent that asked it to run (if not the orchestrator). */
export function parentsOf(task, byId) {
  const ids = [...(task.depends_on || [])];
  const by = byId[task.initiated_by];
  if (by && task.initiated_by !== task.id && by.agent !== 'orchestrator') ids.push(task.initiated_by);
  return ids.filter((id) => byId[id] && id !== task.id);
}

export function stagesOf(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  const depth = {};
  const visit = (t, seen) => {
    if (depth[t.id] != null) return depth[t.id];
    if (seen.has(t.id)) return 1;                       // a cycle should never happen; don't loop on it
    seen.add(t.id);
    const parents = parentsOf(t, byId).map((id) => byId[id]);
    const d = t.agent === 'orchestrator' && !parents.length ? 0
      : parents.length ? 1 + Math.max(...parents.map((p) => visit(p, seen))) : 1;
    depth[t.id] = d;
    return d;
  };
  list.forEach((t) => visit(t, new Set()));
  const cols = [];
  list.forEach((t) => (cols[depth[t.id]] ||= []).push(t));
  return cols.filter(Boolean).map((group, i) => ({ index: i, name: stageName(group), tasks: group }));
}

/** Who asked a task to run again, if it was not part of the first plan. */
export function rerunBy(task, byId) {
  const by = byId[task.initiated_by];
  return by && by.agent !== 'orchestrator' && task.initiated_by !== task.id ? by : null;
}

export function progress(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return {
    done: list.filter((t) => STATUS_DONE.includes(t.status)).length,
    total: list.length,
    running: list.filter((t) => t.status === 'running' || t.status === 'retrying').length,
    failed: list.filter((t) => t.status === 'failed').length,
    retries: list.reduce((n, t) => n + (t.retries || 0), 0),
    tools: list.reduce((n, t) => n + (t.tool_calls?.length || 0), 0),
  };
}

/** "8 ms", "0.9 s", "12 s": a duration for people. */
export function duration(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}
