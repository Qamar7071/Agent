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

const uniqueEvidence = (list) => {
  const seen = new Set();
  return list.filter((e) => {
    const key = `${e?.source}|${e?.detail}`;
    if (!e?.source || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * The run's decisions as cards a person can read without knowing how agents work: what was at
 * stake (a concern), what was recommended and by which agent, what else that agent considered,
 * the decision and whether it is the traveller's to make, with the evidence behind each. Built
 * only from the run's own messages; concerns nobody answered are returned as "noted".
 */
export function decisionCards(messages) {
  const msgs = (messages || []).filter(valid);
  const replies = answers(msgs);
  const byId = Object.fromEntries(msgs.map((m) => [m.id, m]));
  const used = new Set();
  const cards = [];
  for (const c of msgs.filter((m) => m.type === 'concern')) {
    const kids = (replies[c.id] || []).map((id) => byId[id]).filter(Boolean);
    const recommendation = kids.find((m) => m.type === 'proposal') || null;
    const decision = kids.find((m) => m.type === 'decision') || null;
    const considered = recommendation
      ? msgs.filter((m) => m.step === recommendation.step && m.type === 'proposal' && m.id !== recommendation.id && !m.resolvesEventId
        && !used.has(m.id))
      : [];
    [c, ...kids, ...considered].forEach((m) => used.add(m.id));
    cards.push({
      id: c.id,
      kind: kids.length ? 'resolved' : 'noted',
      stake: c,
      recommendation,
      considered,
      decision,
      yours: Boolean(decision && /^your choice is needed/i.test(decision.summary)),
      evidence: uniqueEvidence([...(c.evidence || []), ...(recommendation?.evidence || []), ...(decision?.evidence || [])]),
    });
  }
  const final = finalDecision(msgs);
  if (final && !used.has(final.id)) {
    cards.push({ id: final.id, kind: 'final', stake: null, recommendation: null, considered: [], decision: final,
      yours: /^your choice is needed/i.test(final.summary), evidence: uniqueEvidence(final.evidence || []) });
  }
  // What needs the traveller first, then what the agents settled, then what they only noted.
  const rank = (x) => (x.yours ? 0 : x.kind === 'resolved' ? 1 : x.kind === 'final' ? 2 : 3);
  return cards.sort((a, b) => rank(a) - rank(b));
}
