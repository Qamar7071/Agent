// Safar Saathi data on this phone. Everything is saved locally first (works with no signal) and,
// for trips saved on Raahi's server, synced later. All functions are pure: they take a companion
// and return a new one; load/save do the localStorage part.

import { read, write } from '../store.js';
import { localDate, tripDay } from './pace.js';

const KEY = (id) => `raahi:companion:${id}`;
const INDEX = 'raahi:companions';
export const LANG_KEY = 'raahi:lang';

export function newId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const shortId = () => newId().replace(/-/g, '').slice(0, 12);

// ── persistence ──────────────────────────────────────────────────────────────────
export const listCompanions = () => read(INDEX, []);

export function loadCompanion(id) {
  return read(KEY(id), null);
}

export function saveCompanion(c) {
  write(KEY(c.id), c);
  const entry = { id: c.id, title: c.title, startDate: c.settings.startDate, days: c.plan.days.length,
    updatedAt: c.updatedAt };
  write(INDEX, [entry, ...listCompanions().filter((x) => x.id !== c.id)].slice(0, 20));
  return c;
}

export function removeCompanion(id) {
  write(KEY(id), null);
  write(INDEX, listCompanions().filter((x) => x.id !== id));
}

// ── creating ─────────────────────────────────────────────────────────────────────
/** The parts of an itinerary the companion needs, kept small enough for localStorage. */
export function planSnapshot(itinerary) {
  return {
    title: itinerary.title,
    request: itinerary.request,
    days: itinerary.days.map((d) => ({
      day: d.day, date: d.date, title: d.title, type: d.type, destination_id: d.destination_id || null,
      activities: d.activities || [], overnight: d.overnight || null, risks: (d.risks || []).slice(0, 3),
      moves: (d.moves || []).map((m) => ({ from_name: m.from_name, to_name: m.to_name, to: m.to, mode: m.mode,
        time_label: m.time_label, depart: m.timing?.depart || null, arrive: m.timing?.arrive_around || null })),
      cost: d.cost || {},
    })),
    budget: { total: itinerary.budget?.total ?? null, status: itinerary.budget?.status || null },
  };
}

export function createCompanion({ trip = null, itinerary, settings, alternatives = [], now = new Date() }) {
  const id = trip?.id || `local-${shortId()}`;
  const stamp = now.toISOString();
  return {
    version: 1,
    id,
    server: trip ? { id: trip.id, token: trip.token } : null,
    title: itinerary.title,
    plan: planSnapshot(itinerary),
    alternatives,
    settings: { adjustments: [], ...settings },
    expenses: [],
    nudges: [],
    lastPayer: settings.members[0]?.id || null,
    lastCategory: 'food',
    lastEvaluated: null,
    guardian: null,
    createdAt: stamp,
    updatedAt: stamp,
    syncedAt: null,
  };
}

/** Members to start with: the number of adults on the plan, the first one named by the user. */
export function defaultMembers(request, lang) {
  const n = Math.max(1, Math.min(20, Number(request?.adults) || 1));
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`, name: i === 0 ? '' : `${lang === 'ur' ? 'Saathi' : 'Member'} ${i + 1}`, active: true,
  }));
}

export function budgetTotalFrom(amount, basis, travellers) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return null;
  return Math.round(basis === 'per_person' ? a * Math.max(1, travellers) : a);
}

// ── expenses ─────────────────────────────────────────────────────────────────────
export function todayIndex(c, now = new Date()) {
  return tripDay(c.settings.startDate, localDate(now), c.plan.days.length);
}

function touch(c, now) {
  return { ...c, updatedAt: now.toISOString() };
}

export function addExpense(c, input, now = new Date()) {
  const n = c.plan.days.length;
  const dayIndex = Number.isInteger(input.dayIndex) ? input.dayIndex : Math.min(todayIndex(c, now), n);
  const stamp = now.toISOString();
  const e = {
    id: newId(), tripId: c.id, amountPkr: Math.round(input.amountPkr), category: input.category,
    paidBy: input.paidBy, splitAmong: input.splitAmong || [], note: input.note?.trim() || null,
    dayIndex: Math.max(0, Math.min(dayIndex, n)), createdAt: stamp, updatedAt: stamp, deleted: false,
    syncStatus: c.server ? 'pending' : 'local',
  };
  return [touch({ ...c, expenses: [...c.expenses, e], lastPayer: e.paidBy, lastCategory: e.category }, now), e];
}

export function editExpense(c, id, patch, now = new Date()) {
  const stamp = now.toISOString();
  const expenses = c.expenses.map((e) => (e.id === id
    ? { ...e, ...patch, amountPkr: Math.round(patch.amountPkr ?? e.amountPkr), updatedAt: stamp,
      syncStatus: c.server ? 'pending' : 'local' }
    : e));
  return touch({ ...c, expenses }, now);
}

export const deleteExpense = (c, id, now) => editExpense(c, id, { deleted: true }, now);
export const restoreExpense = (c, id, now) => editExpense(c, id, { deleted: false }, now);

export const pendingExpenses = (c) => c.expenses.filter((e) => e.syncStatus === 'pending');

/** Expenses the server refused (e.g. paid by someone no longer in the group): kept here, not retried. */
export function markRejected(c, rejected) {
  if (!rejected?.length) return c;
  const why = new Map(rejected.map((r) => [r.id, r.reason]));
  return { ...c, expenses: c.expenses.map((e) => (why.has(e.id) ? { ...e, syncStatus: 'rejected', syncError: why.get(e.id) } : e)) };
}

/**
 * Merge the server's list into ours. A change made here that the server hasn't seen yet (newer
 * than the server copy) is kept and stays pending; everything else takes the server's version.
 */
export function mergeServer(c, serverList, now = new Date(), sent = []) {
  const mine = new Map(c.expenses.map((e) => [e.id, e]));
  // What this phone just sent and the server accepted is synced, unless it changed here since.
  const sentAt = new Map(sent.map((e) => [e.id, e.updatedAt]));
  for (const s of serverList) {
    const local = mine.get(s.id);
    const unchanged = local && sentAt.get(s.id) === local.updatedAt;
    if (local && local.syncStatus === 'pending' && !unchanged && Date.parse(local.updatedAt) > Date.parse(s.updatedAt)) continue;
    mine.set(s.id, { ...s, tripId: c.id, syncStatus: 'synced' });
  }
  const expenses = [...mine.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return { ...c, expenses, syncedAt: now.toISOString() };
}

// ── nudges ───────────────────────────────────────────────────────────────────────
export function addNudges(c, fresh) {
  return fresh.length ? { ...c, nudges: [...c.nudges, ...fresh].slice(-60) } : c;
}

export function resolveNudge(c, nudgeId, choice, now = new Date()) {
  return touch({ ...c, nudges: c.nudges.map((x) => (x.id === nudgeId ? { ...x, dismissed: true, choice } : x)) }, now);
}

export function applyAdjustment(c, altId, fromDay, now = new Date()) {
  const adjustments = [...(c.settings.adjustments || []), { altId, fromDay, appliedAt: now.toISOString() }];
  return touch({ ...c, settings: { ...c.settings, adjustments } }, now);
}
