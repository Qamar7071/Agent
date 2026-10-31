// The companion's live state for one trip: local-first data, pace, nudges and background sync.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { localDate, pace, plannedDays } from './pace.js';
import { evaluate } from './nudges.js';
import { nudgeText, strings } from './i18n.js';
import {
  addExpense, addNudges, applyAdjustment, deleteExpense, editExpense, loadCompanion, markRejected, mergeServer,
  pendingExpenses, resolveNudge, restoreExpense, saveCompanion, todayIndex,
} from './store.js';

const SETTINGS_KEYS = ['members', 'budgetTotal', 'budgetBasis', 'startDate', 'language', 'adjustments'];
const serverSettings = (s) => Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k] ?? null]).filter(([, v]) => v !== null));

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/** Variants of the plan the nudges can offer: one stay level cheaper, and coaches instead of a hired car. */
export async function buildAlternatives(request) {
  const variants = [];
  const lower = { premium: 'mid', mid: 'budget' }[request.accommodation];
  if (lower) variants.push(['stay_down', { ...request, accommodation: lower }]);
  if (request.transport === 'car') variants.push(['bus', { ...request, transport: 'bus' }]);
  const out = [];
  for (const [id, req] of variants) {
    try {
      const plan = (await api.plan(req, { timeout: 20000 })).itinerary;
      out.push({ id, days: plan.days.map((d) => ({ day: d.day, cost: d.cost || {} })) });
    } catch { /* an alternative we can't price is simply not offered */ }
  }
  return out;
}

export function useCompanion(id) {
  const [c, setC] = useState(() => loadCompanion(id));
  const [now, setNow] = useState(() => new Date());
  const [sync, setSync] = useState({ state: 'idle', error: null, serverOff: false });
  const online = useOnline();
  const ref = useRef(c);
  ref.current = c;

  const commit = useCallback((next) => {
    ref.current = next;
    saveCompanion(next);
    setC(next);
    return next;
  }, []);

  useEffect(() => { setC(loadCompanion(id)); }, [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    const onFocus = () => setNow(new Date());
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);

  const dayIndex = c ? todayIndex(c, now) : 0;
  const planned = useMemo(() => (c ? plannedDays(c.plan.days, c.alternatives, c.settings.adjustments) : []),
    [c?.plan, c?.alternatives, c?.settings.adjustments]);   // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => (c ? pace({ planned, budgetTotal: c.settings.budgetTotal, expenses: c.expenses, dayIndex }) : null),
    [planned, c?.settings.budgetTotal, c?.expenses, dayIndex]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── sync ──
  const syncing = useRef(false);
  const syncNow = useCallback(async ({ pull = false } = {}) => {
    const cur = ref.current;
    if (!cur?.server || syncing.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    syncing.current = true;
    setSync((s) => ({ ...s, state: 'syncing' }));
    const { id: tid } = cur.server;
    const token = cur.server.member ? { member: cur.server.member } : cur.server.token;
    try {
      if (pull || !cur.settingsSynced) {
        const remote = await api.companionGet(tid, token);
        let next = ref.current;
        if (remote.settings && (cur.settingsSynced || cur.server.member)) {
          // the trip already has settings (e.g. another phone in the group started it): use them,
          // keeping this phone's own language
          next = { ...next, settings: { ...next.settings, ...remote.settings, language: next.settings.language } };
        } else {
          await api.companionPut(tid, token, serverSettings(cur.settings));
        }
        commit({ ...mergeServer(next, remote.expenses), settingsSynced: true });
      }
      const pending = pendingExpenses(ref.current);
      for (let i = 0; i < pending.length || i === 0; i += 100) {
        const batch = pending.slice(i, i + 100);
        if (!batch.length) break;
        const res = await api.expensesSync(tid, token, batch);
        commit(markRejected(mergeServer(ref.current, res.expenses, new Date(), batch), res.rejected));
      }
      setSync({ state: 'ok', error: null, serverOff: false });
    } catch (e) {
      const serverOff = e.status === 503;
      setSync({ state: 'error', error: serverOff ? null : e.message, serverOff });
    } finally {
      syncing.current = false;
    }
  }, [commit]);

  const pushSettings = useCallback(async (next) => {
    if (!next.server || !navigator.onLine) return;
    try {
      await api.companionPut(next.server.id, next.server.member ? { member: next.server.member } : next.server.token,
        serverSettings(next.settings));
    } catch { /* retried on the next full sync */ }
  }, []);

  useEffect(() => { if (c?.server && online) syncNow({ pull: true }); }, [c?.id, online]); // eslint-disable-line
  useEffect(() => {
    if (!c?.server || !online || !pendingExpenses(c).length) return undefined;
    const t = setTimeout(() => syncNow(), 600);
    return () => clearTimeout(t);
  }, [c?.expenses, online]); // eslint-disable-line

  // ── nudges ──
  const lang = c?.settings.language || 'en';
  const askWording = useCallback(async (fresh) => {
    if (!navigator.onLine) return;
    for (const n of fresh.filter((x) => x.ruleId !== 'R4')) {
      const l = ref.current.settings.language || 'en';
      const name = (ref.current.settings.members.find((m) => m.id === ref.current.me) || ref.current.settings.members[0])?.name;
      try {
        const r = await api.nudgeWording({ ruleId: n.ruleId, language: l, text: nudgeText(n, l, name) });
        if (r.mode === 'ai') {
          const cur = ref.current;
          commit({ ...cur, nudges: cur.nudges.map((x) => (x.id === n.id ? { ...x, wording: { ...(x.wording || {}), [l]: r.text } } : x)) });
        }
      } catch { /* the rule-based text stays */ }
    }
  }, [commit]);

  const runNudges = useCallback((next, lastExpense) => {
    const plannedNext = plannedDays(next.plan.days, next.alternatives, next.settings.adjustments);
    const di = todayIndex(next);
    const pNext = pace({ planned: plannedNext, budgetTotal: next.settings.budgetTotal, expenses: next.expenses, dayIndex: di });
    const fresh = evaluate({ p: pNext, planned: plannedNext, alternatives: next.alternatives,
      adjustments: next.settings.adjustments, lastExpense, history: next.nudges });
    const out = commit({ ...addNudges(next, fresh), lastEvaluated: localDate() });
    if (fresh.length) askWording(fresh);
    return out;
  }, [commit, askWording]);

  useEffect(() => {      // once a day on opening: a pace check without a new expense
    if (c && c.lastEvaluated !== localDate(now) && todayIndex(c, now) >= 1) runNudges(c, null);
  }, [c?.id, now]); // eslint-disable-line

  // ── alternatives and Guardian (need the internet; quietly skipped offline) ──
  useEffect(() => {
    if (!c || !online || c.alternatives?.length || (c.altsTriedAt && Date.now() - new Date(c.altsTriedAt) < 3600e3)) return;
    buildAlternatives(c.plan.request).then((alts) => commit({ ...ref.current, alternatives: alts, altsTriedAt: new Date().toISOString() }));
  }, [c?.id, online]); // eslint-disable-line

  useEffect(() => {
    if (!c || !online) return;
    const today = localDate(now);
    const n = c.plan.days.length;
    const tomorrow = Math.max(1, todayIndex(c, now) + 1);
    if (tomorrow > n || c.guardian?.date === today) return;
    const request = { ...c.plan.request, start_date: c.settings.startDate || c.plan.request.start_date };
    api.guardian({ request }).then((res) => {
      if (!res?.ok) return;
      const day = res.assessment?.days?.find((d) => d.day === tomorrow);
      commit({ ...ref.current, guardian: { date: today, day: tomorrow, category: day?.category || null,
        score: day?.score ?? null, action: day?.action || null, alternative: day?.alternative || null,
        factors: (day?.factors || []).slice(0, 2).map((f) => f.evidence), alerts: res.assessment?.alert_titles || [],
        checkedAt: res.checked_at } });
    }).catch(() => { /* Guardian is a bonus: no card if it can't be reached */ });
  }, [c?.id, online, now]); // eslint-disable-line

  // ── actions ──
  const add = useCallback((input) => {
    const [next, e] = addExpense(ref.current, input);
    runNudges(next, e);
    return e;
  }, [runNudges]);

  const update = useCallback((expenseId, patch) => {
    const next = editExpense(ref.current, expenseId, patch);
    runNudges(next, next.expenses.find((e) => e.id === expenseId));
  }, [runNudges]);

  const remove = useCallback((expenseId) => commit(deleteExpense(ref.current, expenseId)), [commit]);
  const restore = useCallback((expenseId) => commit(restoreExpense(ref.current, expenseId)), [commit]);

  const choose = useCallback((nudge, option) => {
    let next = ref.current;
    if (option.action.type === 'apply_alt') next = applyAdjustment(next, option.action.altId, option.action.fromDay);
    next = resolveNudge(next, nudge.id, option.id);
    if (nudge.ruleId === 'R4' && option.action.type === 'dismiss') runNudges(next, null);   // confirmed: now check the pace
    else commit(next);
    if (option.action.type === 'apply_alt') pushSettings(next);
    return option.action;
  }, [commit, pushSettings, runNudges]);

  const updateSettings = useCallback((patch) => {
    const next = commit({ ...ref.current, settings: { ...ref.current.settings, ...patch }, updatedAt: new Date().toISOString() });
    pushSettings(next);
    if (patch.language) try { localStorage.setItem('raahi:lang', JSON.stringify(patch.language)); } catch { /* ok */ }
  }, [commit, pushSettings]);

  return {
    c, p, planned, dayIndex, now, online, sync, lang, s: strings(lang),
    pending: c ? pendingExpenses(c).length : 0,
    add, update, remove, restore, choose, updateSettings, syncNow,
  };
}
