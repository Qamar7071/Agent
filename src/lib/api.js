// ─────────────────────────────────────────────────────────────────────────────
// Integration point with your existing AI backend.
//
//   POST {CHAT_ENDPOINT}  body: { message, history: [{ role, content }] }
//   POST {PLAN_ENDPOINT}  body: { from, destinations, start_date, days, travelers,
//                                 budget_pkr, interests, transport }
//
// The response normalisers below accept the common shapes (reply / response /
// answer / text, optional destinations, itinerary, actions) so the UI renders
// structured results as cards and timelines instead of raw JSON.
// No API keys live here — the backend owns them.
// ─────────────────────────────────────────────────────────────────────────────
import { destinations, matchDestinations } from '../data/destinations.js';

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const CHAT = import.meta.env.VITE_CHAT_ENDPOINT || '/api/chat';
const PLAN = import.meta.env.VITE_PLAN_ENDPOINT || '/api/plan';

export class ApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'timeout' | 'server'
  }
}

async function post(path, body, { timeout = 60000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeout);
  signal?.addEventListener('abort', () => ctrl.abort('cancel'));
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.reason === 'timeout') throw new ApiError('timeout', 'The AI backend took too long to answer.');
    throw new ApiError('unreachable', 'The AI backend could not be reached.');
  }
  clearTimeout(timer);

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    // No route / proxy could not connect / static host → treat as "backend not running".
    const looksMissing = [404, 405, 502, 503, 504].includes(res.status) || (res.status === 500 && !data);
    if (looksMissing) throw new ApiError('unreachable', 'The AI backend is not running.');
    throw new ApiError('server', data?.error || data?.detail || `The AI backend returned an error (${res.status}).`);
  }
  if (data === null) return { reply: raw };
  return data;
}

// ── Chat ────────────────────────────────────────────────────────────────────
export async function sendChat(message, history, opts) {
  const data = await post(CHAT, { message, history }, opts);
  return normaliseChat(data);
}

const pickText = (o) =>
  typeof o === 'string' ? o : o?.reply ?? o?.response ?? o?.answer ?? o?.message ?? o?.text ?? o?.content ?? o?.output ?? '';

function resolveDestinations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => {
      const name = typeof x === 'string' ? x : x?.id || x?.name || x?.destination || '';
      const byId = destinations.find((d) => d.id === name);
      return byId?.id || matchDestinations(name)[0];
    })
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

export function normaliseChat(data) {
  let obj = data;
  let text = pickText(obj);
  // Some backends return the structured JSON as a string inside `reply`.
  if (typeof text === 'string' && /^\s*[{[]/.test(text)) {
    try {
      const inner = JSON.parse(text);
      obj = { ...obj, ...inner };
      text = pickText(inner);
    } catch {
      /* plain text that happens to start with a brace */
    }
  }
  const itinerary = obj?.itinerary || obj?.plan || (Array.isArray(obj?.days) ? { days: obj.days } : null);
  return {
    text: typeof text === 'string' ? text : '',
    destinations: resolveDestinations(obj?.destinations || obj?.places),
    itinerary: itinerary ? normalisePlan(itinerary) : null,
    actions: Array.isArray(obj?.actions) ? obj.actions.filter((a) => a?.label) : [],
    links: Array.isArray(obj?.links) ? obj.links.filter((l) => l?.href && /^https?:/.test(l.href)) : [],
    aiAvailable: obj?.ai_available !== false,
  };
}

// ── Trip plan ───────────────────────────────────────────────────────────────
export async function requestPlan(form, opts) {
  const data = await post(
    PLAN,
    {
      from: form.from,
      destinations: form.destinations,
      start_date: form.startDate,
      days: form.days,
      travelers: form.travelers,
      budget_pkr: form.budget,
      interests: form.interests,
      transport: form.transport,
    },
    { timeout: 90000, ...opts },
  );
  const plan = normalisePlan(data?.itinerary || data?.plan || data);
  if (!plan.days.length) throw new ApiError('server', 'The AI backend answered, but without a day-by-day plan.');
  return { ...plan, source: 'ai' };
}

const num = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
};

const asList = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.name || x?.title || x?.activity || '')).filter(Boolean) : typeof v === 'string' && v ? v.split(/\n|;|•/).map((s) => s.trim()).filter(Boolean) : []);

export function normalisePlan(p) {
  const daysRaw = Array.isArray(p) ? p : p?.days || p?.itinerary || p?.schedule || [];
  const days = (Array.isArray(daysRaw) ? daysRaw : []).map((d, i) => {
    const location = d?.location || d?.destination || d?.place || d?.city || '';
    const destinationId = d?.destinationId || destinations.find((x) => x.id === location)?.id || matchDestinations(`${location} ${d?.title || ''}`)[0] || null;
    return {
      day: d?.day ?? d?.day_number ?? i + 1,
      date: d?.date || null,
      title: d?.title || d?.summary || d?.heading || (location ? `Day in ${location}` : `Day ${i + 1}`),
      destinationId,
      location,
      activities: asList(d?.activities || d?.plan || d?.items),
      notes: asList(d?.notes || d?.tips),
      transport: typeof d?.transport === 'string' ? d.transport : d?.transport?.mode || null,
      stay: typeof d?.stay === 'string' ? d.stay : d?.accommodation || d?.hotel || null,
      cost: num(d?.estimated_cost ?? d?.cost ?? d?.budget),
      leg: d?.leg || null, // backend / offline planner: distance + Google Maps link
      hub: d?.hub,
      firstAtDest: d?.firstAtDest,
    };
  });
  return {
    title: p?.title || p?.name || 'Your Northern Pakistan journey',
    summary: p?.summary || p?.overview || '',
    days,
    totalCost: num(p?.total_cost ?? p?.estimated_total ?? p?.totalCost ?? p?.total_estimated_cost),
    budget: p?.budget || null, // transparent breakdown from the backend / planner
    stayRecs: Array.isArray(p?.stayRecs) ? p.stayRecs : [],
    warnings: asList(p?.warnings),
    notes: asList(p?.notes || p?.tips),
  };
}
