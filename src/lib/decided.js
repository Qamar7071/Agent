// "How the agents decided": helpers that turn a real run (or its live events) into the
// conversation shown to people. Pure functions, so they are unit-tested with node --test.
// Nothing here writes a message: every message comes from the server's run.

export const RECORDED = 'recorded';
export const LIVE_LIMIT_MS = 25000;
export const TYPES = ['proposal', 'concern', 'decision'];

/** Messages of a finished run, oldest first. Older runs saved before messages existed have none. */
export function messagesOf(run) {
  return Array.isArray(run?.messages) ? run.messages.filter(valid) : [];
}

/** Messages that arrived so far in a live stream of execution events. */
export function messagesFromEvents(events) {
  const seen = new Set();
  const out = [];
  for (const e of events || []) {
    const m = e?.type === 'message' ? e.message : null;
    if (valid(m) && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

function valid(m) {
  return Boolean(m && typeof m === 'object' && m.id && m.summary && TYPES.includes(m.type));
}

/** Who answered which message: { [id]: [ids of later messages that resolve it] }. */
export function answers(messages) {
  const ids = new Set(messages.map((m) => m.id));
  const out = {};
  for (const m of messages) {
    if (m.resolvesEventId && ids.has(m.resolvesEventId)) (out[m.resolvesEventId] ||= []).push(m.id);
  }
  return out;
}

/** The decision the conversation ends with: the last decision message, if any. */
export function finalDecision(messages) {
  return [...messages].reverse().find((m) => m.type === 'decision') || null;
}

export function stats(messages) {
  const answered = answers(messages);
  const concerns = messages.filter((m) => m.type === 'concern');
  return {
    total: messages.length,
    proposals: messages.filter((m) => m.type === 'proposal').length,
    concerns: concerns.length,
    answered: concerns.filter((m) => answered[m.id]).length,
    decisions: messages.filter((m) => m.type === 'decision').length,
    agents: new Set(messages.map((m) => m.step)).size,
  };
}

/** Milliseconds from the start of the run to each message, from the run's own event log. */
export function offsets(run) {
  const out = {};
  for (const e of run?.events || []) {
    if (e?.type === 'message' && e.message?.id && Number.isFinite(e.ms)) out[e.message.id] = e.ms;
  }
  return out;
}

/**
 * Delays for playing a recorded run back: the real gaps between messages, kept readable
 * (at least `min`, at most `max` milliseconds each).
 */
export function playbackDelays(run, { min = 450, max = 1400 } = {}) {
  const ms = offsets(run);
  let last = 0;
  return messagesOf(run).map((m, i) => {
    const at = ms[m.id];
    const gap = Number.isFinite(at) ? at - last : min;
    if (Number.isFinite(at)) last = at;
    return i === 0 ? min : Math.min(max, Math.max(min, gap));
  });
}

/** The agent's display name in this run: its task label, else a readable form of its name. */
export function agentName(message, tasksById) {
  const label = tasksById?.[message.step]?.label;
  if (label) return label;
  const n = String(message.agent || 'agent');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** The Agent Control Center address for a message's step. */
export function stepLink(runId, step) {
  const q = new URLSearchParams({ run: runId || RECORDED });
  if (step) q.set('task', step);
  return `/agents?${q.toString()}`;
}

/** The newest saved run that has a conversation. */
export function latestWithMessages(runs) {
  return (runs || []).find((r) => messagesOf(r).length > 0) || null;
}
