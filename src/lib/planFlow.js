// Flipped-interaction, adaptive planning flow for the OFFLINE agent (no backend needed).
// Raahi asks the traveller for what it's missing — one thing at a time, with quick
// replies — remembers the answers, adapts its suggestions, then auto-builds the plan.
import { destinations, destinationById, months, matchDestinations, seasonOf } from '../data/destinations.js';
import { origins } from '../data/content.js';
import { todayIso } from './format.js';

// ── Parsers: pull any slot values out of a free-text message ──────────────────
function parseMonth(t) {
  for (let i = 0; i < months.length; i++) {
    const m = months[i].toLowerCase();
    if (t.includes(m) || new RegExp(`\\b${m.slice(0, 3)}\\b`).test(t)) return i + 1;
  }
  return null;
}
function parseTravellers(t) {
  if (/\b(solo|alone|just me|akela)\b/.test(t)) return 1;
  if (/\b(couple|two of us|me and)\b/.test(t)) return 2;
  if (/\b(group|6\+|six|team)\b/.test(t)) return 6;
  const m = t.match(/(\d+)\s*(people|persons?|travell?ers?|pax|adults?|log|bande)?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 30) return n;
  }
  return null;
}
function parseBudget(t) {
  if (/\b(flexible|any|no limit|open|jitna)\b/.test(t)) return 'flexible';
  const k = t.match(/(\d+(?:\.\d+)?)\s*(k|lac|lakh|hazar|thousand)/);
  if (k) {
    const mult = /lac|lakh/.test(k[2]) ? 100000 : 1000;
    return Math.round(Number(k[1]) * mult);
  }
  const raw = t.replace(/pkr|rs\.?|rupees?|,/g, '').match(/\b(\d{4,7})\b/);
  if (raw) return Number(raw[1]);
  return null;
}
function parsePace(t) {
  if (/\b(trek|trekk|hike|hiking|adventure|hard|challenging|base camp|mushkil)\b/.test(t)) return 'trek';
  if (/\b(relax|relaxed|slow|easy|chill|family|aaram|sakoon)\b/.test(t)) return 'relaxed';
  if (/\b(balance|balanced|mix|normal|moderate)\b/.test(t)) return 'balanced';
  return null;
}
function parseFrom(t) {
  const hit = origins.find((o) => t.includes(o.toLowerCase()));
  if (hit) return hit;
  if (/\b(pindi|rwp)\b/.test(t)) return 'Rawalpindi';
  if (/\b(isb|islamabad|capital)\b/.test(t)) return 'Islamabad';
  return null;
}
function parseDays(t) {
  const w = t.match(/(\d+)\s*(days?|din|nights?)/);
  if (w) {
    const n = Number(w[1]);
    if (n >= 2 && n <= 30) return n;
  }
  if (/\bweek\b/.test(t) && !/weekend/.test(t)) return 7;
  if (/\bweekend\b/.test(t)) return 3;
  if (/\b(two weeks|fortnight)\b/.test(t)) return 14;
  return null;
}

// Adaptive defaults when the traveller says "you choose".
function suggestDestinations(pace, month) {
  if (pace === 'trek') return ['fairy-meadows', 'deosai', 'skardu'];
  if (month && (month === 12 || month <= 2)) return ['hunza', 'attabad', 'skardu']; // winter — open towns
  return ['hunza', 'attabad', 'passu'];
}

// Fill every slot a message can answer (people can give several at once).
function absorb(state, text) {
  const t = ` ${text.toLowerCase()} `;
  const v = { ...state.values };
  const asked = state.asked;

  const ds = matchDestinations(text);
  if (ds.length) v.destinations = Array.from(new Set([...(v.destinations || []), ...ds]));
  if (/\b(you choose|aap|tum|surprise|whatever|anywhere|recommend|koi be|kahin be)\b/.test(t)) v.destinations = v.destinations?.length ? v.destinations : '__auto__';

  // Only read a city as the STARTING point when the message is about starting
  // (or we just asked for it) — otherwise "Skardu" as a destination would be misread.
  if (asked === 'from' || /\b(from|start|starting|leav|depart|origin|rehta|rehte)\b/.test(t)) {
    const from = parseFrom(t);
    if (from) v.from = from;
  }
  const month = parseMonth(t);
  if (month) v.month = month;
  const days = parseDays(t);
  if (days) v.days = days;
  const pace = parsePace(t);
  if (pace) v.pace = pace;
  const budget = parseBudget(t);
  if (budget != null) v.budget = budget;

  // A bare number answers whichever numeric slot we just asked.
  const bare = t.trim().match(/^\s*(\d+)\s*$/);
  if (bare) {
    const n = Number(bare[1]);
    if (asked === 'travellers' && n >= 1 && n <= 30) v.travellers = n;
    else if (asked === 'days' && n >= 2 && n <= 30) v.days = n;
    else if (asked === 'budget') v.budget = n < 1000 ? n * 1000 : n;
  }
  if (asked === 'travellers' && v.travellers == null) {
    const tr = parseTravellers(t);
    if (tr) v.travellers = tr;
  }
  if (v.travellers == null) {
    const tr = parseTravellers(t);
    if (tr && /\b(people|persons?|travell?er|pax|adult|solo|couple|group|log|bande)\b/.test(t)) v.travellers = tr;
  }
  return v;
}

const Q = {
  destinations: {
    text: 'Where would you like to go? Pick one or more — or tap “You choose” and I’ll decide based on the season.',
    chips: () => [
      { label: 'Hunza', value: 'Hunza' },
      { label: 'Skardu', value: 'Skardu' },
      { label: 'Fairy Meadows', value: 'Fairy Meadows' },
      { label: 'Deosai', value: 'Deosai' },
      { label: 'You choose', value: 'you choose for me' },
    ],
  },
  from: {
    text: 'Where will you start your journey from?',
    chips: () => [
      { label: 'Islamabad', value: 'from Islamabad' },
      { label: 'Lahore', value: 'from Lahore' },
      { label: 'Karachi', value: 'from Karachi' },
      { label: 'Gilgit', value: 'from Gilgit' },
      { label: 'Skardu', value: 'from Skardu' },
    ],
  },
  month: {
    text: 'Which month are you planning to travel? It changes what’s open.',
    chips: () => [
      { label: 'May', value: 'in May' },
      { label: 'July', value: 'in July' },
      { label: 'September', value: 'in September' },
      { label: 'Not sure yet', value: 'not sure about the month' },
    ],
  },
  days: {
    text: 'How many days do you have for the trip?',
    chips: () => [
      { label: '5 days', value: '5 days' },
      { label: '7 days', value: '7 days' },
      { label: '10 days', value: '10 days' },
      { label: '14 days', value: '14 days' },
    ],
  },
  travellers: {
    text: 'How many of you are travelling?',
    chips: () => [
      { label: 'Solo', value: 'solo traveller' },
      { label: '2 people', value: '2 people' },
      { label: '4 people', value: '4 people' },
      { label: 'Group (6+)', value: 'group of 6 people' },
    ],
  },
  budget: {
    text: 'Roughly what’s your total budget in PKR? I’ll keep the plan within it.',
    chips: () => [
      { label: 'PKR 50k', value: 'budget 50k' },
      { label: 'PKR 100k', value: 'budget 100k' },
      { label: 'PKR 200k', value: 'budget 200k' },
      { label: 'Flexible', value: 'flexible budget' },
    ],
  },
  pace: {
    text: 'Last one — what’s your travel style?',
    chips: () => [
      { label: 'Relaxed & scenic', value: 'relaxed pace' },
      { label: 'Balanced', value: 'balanced pace' },
      { label: 'Treks & adventure', value: 'trekking adventure' },
    ],
  },
};

const ORDER = ['destinations', 'from', 'days', 'travellers', 'budget', 'month', 'pace'];

function nextMissing(v) {
  for (const slot of ORDER) {
    if (slot === 'destinations' && !(v.destinations === '__auto__' || v.destinations?.length)) return slot;
    if (slot === 'month' && v.month == null && v.pace != null) continue; // month optional at the end
    if (slot !== 'destinations' && v[slot] == null) return slot;
  }
  return null;
}

function finalise(v) {
  const pace = v.pace || 'balanced';
  let dest = v.destinations === '__auto__' || !v.destinations?.length ? suggestDestinations(pace, v.month) : v.destinations;

  // Adaptation: warn + fix if the month closes a chosen high-altitude stop.
  const winterReachable = ['hunza', 'skardu', 'attabad'];
  let swapNote = '';
  if (v.month && seasonOf(v.month) === 'winter') {
    const closed = dest.filter((id) => !destinationById[id].bestMonths.includes(v.month));
    if (closed.length) {
      let open = dest.filter((id) => !closed.includes(id));
      if (!open.length) open = winterReachable; // towns stay reachable in snow
      swapNote = ` Heads up: ${closed.map((id) => destinationById[id].name).join(', ')} ${closed.length > 1 ? 'are' : 'is'} usually snowed-in in ${months[v.month - 1]} — I’ve focused on the towns that stay reachable (${open.map((id) => destinationById[id].name).join(', ')}). Expect quiet, snowy off-season travel and check road/flight status.`;
      dest = Array.from(new Set(open)).slice(0, 4);
    }
  }

  // Trek pace nudges fewer stops when relaxed.
  let days = v.days;
  if (pace === 'relaxed' && dest.length > 3) dest = dest.slice(0, 3);
  if (!dest.length) dest = winterReachable.slice(0, 3);

  // Month → a concrete start date (next occurrence, day 5).
  let startDate;
  if (v.month) {
    const now = new Date();
    let year = now.getFullYear();
    if (v.month < now.getMonth() + 1) year += 1;
    startDate = `${year}-${String(v.month).padStart(2, '0')}-05`;
  } else {
    startDate = todayIso(21);
  }

  const interests = pace === 'trek' ? ['trekking', 'adventure'] : pace === 'relaxed' ? ['lakes', 'culture'] : ['lakes', 'photography'];
  const transport = origins.includes(v.from) && ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Rawalpindi'].includes(v.from) ? 'car' : 'car';

  const values = {
    from: v.from,
    destinations: dest,
    days,
    travelers: v.travellers,
    budget: v.budget === 'flexible' ? undefined : v.budget,
    startDate,
    interests,
    transport,
  };
  const names = dest.map((id) => destinationById[id].name);
  const summary = `Perfect — a ${days}-day ${pace} trip from ${v.from}${v.month ? ` in ${months[v.month - 1]}` : ''} for ${v.travellers} ${v.travellers === 1 ? 'traveller' : 'travellers'}, around ${names.join(', ')}.${swapNote} Building your day-by-day plan now…`;
  return { values, summary };
}

export const isPlanIntent = (t) => /\b(plan|itinerar|trip|tour|schedule|route|ghoom|jana|visit|\d+\s*days?)\b/i.test(t);

// Returns { state, reply }. reply: { text, chips?, finalize?: {values} }
export function flowStep(prevState, text) {
  const state = prevState || { values: {}, asked: null, active: true };
  const values = absorb(state, text || '');
  const missing = nextMissing(values);

  if (!missing) {
    const { values: final, summary } = finalise(values);
    return { state: null, reply: { text: summary, finalize: { values: final } } };
  }

  const q = Q[missing];
  // Adaptive acknowledgement so it feels like it's listening.
  const ackBits = [];
  if (values.destinations?.length && missing !== 'destinations') ackBits.push('Noted');
  const lead = state.asked && state.asked !== missing && ackBits.length ? 'Got it. ' : '';
  return {
    state: { values, asked: missing, active: true },
    reply: { text: lead + q.text, chips: q.chips() },
  };
}

export function startFlow(text) {
  return flowStep({ values: {}, asked: null, active: true }, text || '');
}
