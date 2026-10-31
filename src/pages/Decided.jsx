// "How the agents decided": the agents' conversation for one real run, as a group chat.
//
// Sources, from the address:
//   ?run=<id>        a run saved in this browser (from the planner, Travel Twin, Guardian…)
//   ?run=recorded    the recorded demo run, always labelled as recorded and not live
//   ?group=<code>    the Group Room's options run (needs this browser's member key)
//   ?trip=<id>       a Safar Saathi trip: its last run, or a new live run on its plan
//   (none)           the newest saved run with a conversation, or a choice to run live
// A live run streams messages as the agents write them. If it fails or takes longer than
// 25 seconds, the recorded run plays instead, clearly labelled, while the live run continues.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Play, RotateCcw, SkipForward, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { Link, useRouter } from '../lib/router.jsx';
import { usePageMeta } from '../lib/seo.js';
import { read, write } from '../lib/store.js';
import { saveRun, savedRuns, useAgentRun } from '../lib/agentRun.js';
import {
  LIVE_LIMIT_MS, RECORDED, finalDecision, latestWithMessages, messagesFromEvents, messagesOf, offsets as offsetsOf,
  playbackDelays, stats as statsOf,
} from '../lib/decided.js';
import { decidedStrings } from '../lib/decidedI18n.js';
import { useLang } from '../lib/useLang.js';
import { groupEntry, normaliseCode } from '../lib/group/store.js';
import { loadCompanion } from '../lib/companion/store.js';
import { LanguageSwitch } from '../components/companion/TripSettings.jsx';
import Conversation, { Crew, DecisionCard } from '../components/decided/Conversation.jsx';
import Notice from '../components/ui/Notice.jsx';

const loadRecorded = () => import('../data/demo-run.json').then((m) => m.default);
const tripKey = (id) => `raahi:decided:trip:${id}`;

function stamp(iso, dateOnly = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateOnly
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Reveal a finished run's messages one by one at their real pace (or all at once). */
function usePlayback(run, auto) {
  const total = messagesOf(run).length;
  const [st, setSt] = useState({ run: null, shown: 0 });
  const timer = useRef(null);
  const play = useCallback(() => {
    clearTimeout(timer.current);
    if (!run || reducedMotion()) {
      setSt({ run, shown: total });
      return;
    }
    const delays = playbackDelays(run);
    let i = 0;
    setSt({ run, shown: 0 });
    const next = () => {
      timer.current = setTimeout(() => {
        i += 1;
        setSt({ run, shown: i });
        if (i < total) next();
      }, delays[i]);
    };
    next();
  }, [run, total]);
  useEffect(() => {
    if (auto) play();
    return () => clearTimeout(timer.current);
  }, [auto, play]);
  const skip = () => {
    clearTimeout(timer.current);
    setSt({ run, shown: total });
  };
  // Until this run has been played, a recorded run starts empty and any other run shows in full.
  const shown = st.run === run ? Math.min(st.shown, total) : (auto && !reducedMotion() ? 0 : total);
  return { shown, playing: shown < total, play, skip };
}

function Badge({ tone, children, pulse = false }) {
  const tones = {
    live: 'border-juniper/40 bg-juniper-50 text-juniper-700',
    recorded: 'border-ochre/50 bg-ochre-50 text-ochre-700',
    saved: 'border-limestone-400 bg-limestone/60 text-ink-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {pulse && <span className="h-2 w-2 animate-pulseDot rounded-full bg-juniper" aria-hidden="true" />}
      {children}
    </span>
  );
}

export default function Decided() {
  const { query, navigate } = useRouter();
  const [lang, setLang] = useLang();
  const s = decidedStrings(lang);
  const runParam = query.get('run');
  const groupParam = query.get('group');
  const tripParam = query.get('trip');
  usePageMeta({
    title: s.label,
    description: 'How Raahi’s agents reached a plan: each agent’s proposals, concerns and decisions, with the evidence behind them.',
    path: '/decided',
    noindex: Boolean(runParam || groupParam || tripParam),
  });

  const live = useAgentRun();
  const liveStart = live.start;
  const [view, setView] = useState({ state: 'loading' });
  const [recorded, setRecorded] = useState(null);
  const [fallback, setFallback] = useState(null);       // null | 'slow' | { failed: message }
  const [preferLive, setPreferLive] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const startLive = useCallback((payload, title, ctx = {}) => {
    setFallback(null);
    setPreferLive(false);
    setView({ state: 'ready', source: 'live', title, ctx: { ...ctx, payload } });
    liveStart(api.runAgents, payload, title).then((res) => {
      if (res?.run && ctx.rememberKey) write(ctx.rememberKey, res.run.id);
    });
  }, [liveStart]);

  // Work out what to show from the address.
  useEffect(() => {
    let off = false;
    const ready = (v) => !off && setView({ state: 'ready', ...v });
    const fail = (error, extra = {}) => !off && setView({ state: 'error', error, ...extra });
    setFallback(null);
    setView({ state: 'loading' });
    (async () => {
      if (runParam === RECORDED) {
        const rec = await loadRecorded();
        if (off) return;
        setRecorded(rec);
        ready({ source: 'recorded', run: rec.run, title: rec.message });
      } else if (runParam) {
        const run = savedRuns().find((r) => r.id === runParam);
        if (run) ready({ source: 'saved', run, title: run.title });
        else fail('notFound');
      } else if (groupParam) {
        const code = normaliseCode(groupParam);
        const entry = groupEntry(code);
        const ctx = { back: `/g/${code}`, backLabel: 'backGroup' };
        if (!entry) {
          fail('joinFirst', { ctx });
          return;
        }
        try {
          const { run } = await api.groupRun(code, entry.token);
          const title = `Group options · ${entry.title || code}`;
          saveRun(run, title);                 // so "See this step" opens it in the Control Center
          ready({ source: 'group', run, title, ctx });
        } catch (e) {
          const code404 = { 404: 'groupNone', 503: 'storageOff', 403: 'joinFirst' }[e.status];
          fail(code404 || e.message, { ctx, retry: !code404 || e.status === 503 });
        }
      } else if (tripParam) {
        const c = loadCompanion(tripParam);
        if (!c?.plan?.request) {
          fail('tripMissing', { ctx: { back: '/trips', backLabel: 'backTrip' } });
          return;
        }
        const ctx = { back: `/trip/${c.id}`, backLabel: 'backTrip', rememberKey: tripKey(c.id), title: c.title };
        const known = read(tripKey(c.id), null);
        const run = known && savedRuns().find((r) => r.id === known);
        if (run) ready({ source: 'saved', run, title: c.title, ctx: { ...ctx, payload: { request: c.plan.request } } });
        else if (!off) startLive({ request: c.plan.request }, c.title, ctx);
      } else {
        const latest = latestWithMessages(savedRuns());
        if (latest) ready({ source: 'saved', run: latest, title: latest.title });
        else if (!off) setView({ state: 'empty' });
      }
    })().catch((e) => fail(e.message));
    return () => { off = true; };
  }, [runParam, groupParam, tripParam, attempt, startLive]);

  // A live run that fails, or is still going after 25 seconds, hands over to the recorded run.
  const isLive = view.source === 'live';
  useEffect(() => {
    if (!isLive || live.status !== 'running') return undefined;
    const t = setTimeout(() => setFallback('slow'), LIVE_LIMIT_MS);
    return () => clearTimeout(t);
  }, [isLive, live.status]);
  useEffect(() => {
    if (isLive && live.status === 'error') setFallback({ failed: live.error?.message || 'error' });
  }, [isLive, live.status, live.error]);
  useEffect(() => {
    if (fallback && !recorded) loadRecorded().then(setRecorded).catch(() => {});
  }, [fallback, recorded]);

  const showRecorded = view.source === 'recorded' || (isLive && fallback && !preferLive);
  const liveDone = isLive && live.status === 'done' && live.run;

  // What the conversation shows right now.
  const shown = useMemo(() => {
    if (view.state !== 'ready') return null;
    if (showRecorded) {
      if (!recorded) return null;
      return { kind: 'recorded', run: recorded.run };
    }
    if (isLive) {
      if (live.run) return { kind: 'live', run: live.run };
      const tasks = live.tasks;
      const messages = messagesFromEvents(live.events);
      return { kind: 'live', streaming: true, run: { id: messages[0]?.runId, tasks, events: live.events, messages } };
    }
    return { kind: view.source, run: view.run };
  }, [view, showRecorded, recorded, isLive, live.run, live.tasks, live.events]);

  const run = shown?.run;
  const playback = usePlayback(shown?.streaming ? null : run, shown?.kind === 'recorded');
  const all = useMemo(() => messagesOf(run), [run]);
  const visible = shown?.streaming ? all : all.slice(0, playback.shown);
  const tasksById = useMemo(() => Object.fromEntries((run?.tasks || []).map((t) => [t.id, t])), [run]);
  const offsets = useMemo(() => offsetsOf(run), [run]);
  const working = shown?.streaming ? (run?.tasks || []).filter((t) => t.status === 'running' || t.status === 'retrying') : [];
  const finished = run && !shown?.streaming && !playback.playing;
  const runId = shown?.kind === 'recorded' ? RECORDED : run?.id;
  const controlLink = `/agents?run=${runId}`;
  const ctx = view.ctx || {};

  const others = useMemo(
    () => (view.state === 'loading' ? [] : savedRuns().filter((r) => messagesOf(r).length && r.id !== run?.id).slice(0, 6)),
    [view.state, run?.id, live.status],
  );

  const errorText = (e) => (typeof s[e] === 'string' ? s[e] : e);
  const runSample = () => startLive({ message: s.sample }, s.sample);
  const askAgain = ctx.payload ? () => startLive(ctx.payload, view.title, ctx) : null;

  const actions = (
    <>
      {ctx.back && <Link to={ctx.back} className="btn-primary min-h-[48px]">{s[ctx.backLabel] || s.backTrip}</Link>}
      {run?.id && <Link to={controlLink} className="btn-outline min-h-[48px]">{s.openControl}</Link>}
      {askAgain && live.status !== 'running' && <button type="button" className="btn-outline min-h-[48px]" onClick={askAgain}><RotateCcw size={16} aria-hidden="true" /> {s.askAgain}</button>}
    </>
  );

  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] w-full max-w-2xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {ctx.back ? <Link to={ctx.back} className="link text-sm">{s[ctx.backLabel] || s.backTrip}</Link> : <span />}
        <LanguageSwitch value={lang} onChange={setLang} label={s.language} />
      </div>
      <h1 className="type-wide mt-3 text-3xl font-extrabold">{s.label}</h1>
      <p className="mt-2 text-ink-600">{s.intro}</p>
      {s.englishOnly && <p className="mt-1 text-sm text-ink-500">{s.englishOnly}</p>}

      {view.state === 'loading' && <p className="mt-8 text-ink-600" role="status">{s.loading}</p>}

      {view.state === 'error' && (
        <div className="mt-6 flex flex-col gap-3">
          <Notice level="warning" action={(
            <div className="flex flex-wrap gap-2">
              {view.retry && <button type="button" className="btn-outline" onClick={() => setAttempt((a) => a + 1)}>{s.retry}</button>}
              {view.ctx?.back && <Link to={view.ctx.back} className="btn-outline">{s[view.ctx.backLabel] || s.backTrip}</Link>}
            </div>
          )}>{errorText(view.error)}</Notice>
        </div>
      )}

      {view.state === 'empty' && (
        <section className="mt-6 rounded-lg border border-limestone-300 bg-paper p-5" aria-labelledby="empty-h">
          <h2 id="empty-h" className="type-semiwide text-xl font-bold">{s.emptyTitle}</h2>
          <p className="mt-1 text-ink-600">{s.emptyHow}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary min-h-[48px]" onClick={runSample}><Sparkles size={16} aria-hidden="true" /> {s.runSample}</button>
            <Link to={`/decided?run=${RECORDED}`} className="btn-outline min-h-[48px]"><Play size={16} aria-hidden="true" /> {s.playRecorded}</Link>
          </div>
          <p className="mt-2 text-sm text-ink-500">{s.sampleHint}</p>
        </section>
      )}

      {view.state === 'ready' && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {shown?.kind === 'recorded' && <Badge tone="recorded">{s.recordedBadge}</Badge>}
            {shown?.kind === 'live' && <Badge tone="live" pulse={shown.streaming}>{s.liveBadge}</Badge>}
            {shown?.kind === 'saved' && <Badge tone="saved">{s.savedBadge(stamp(run?.started_at))}</Badge>}
            {shown?.kind === 'group' && <Badge tone="saved">{s.groupBadge}</Badge>}
          </div>
          <p className="mt-2 break-words text-sm">
            <span className="font-semibold">{s.request}:</span> {shown?.kind === 'recorded' ? recorded?.message : view.title}
          </p>
          {all.length > 0 && <div className="mt-4"><Crew messages={all} tasksById={tasksById} label={s.crew} /></div>}

          <div className="mt-3 flex flex-col gap-3">
            {isLive && fallback === 'slow' && !preferLive && <Notice level="info">{s.slow}</Notice>}
            {isLive && fallback?.failed && !preferLive && <Notice level="warning">{s.failed(fallback.failed)}</Notice>}
            {shown?.kind === 'recorded' && recorded && <Notice level="info">{s.recordedNote(stamp(recorded.recorded_at, true))}</Notice>}
            {isLive && fallback && !preferLive && liveDone && (
              <Notice level="info" action={<button type="button" className="btn-primary" onClick={() => setPreferLive(true)}>{s.showLive}</button>}>{s.liveReady}</Notice>
            )}
          </div>

          {run && !shown?.streaming && all.length === 0 && (
            <Notice level="info" className="mt-6" action={run.id && <Link to={controlLink} className="btn-outline">{s.openControl}</Link>}>{s.oldRun}</Notice>
          )}

          {(all.length > 0 || shown?.streaming) && (
            <section aria-labelledby="convo-h" className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="convo-h" className="text-sm font-semibold text-ink-600">
                  {playback.playing ? s.progress(playback.shown, all.length) : s.stats(statsOf(visible))}
                </h2>
                {playback.playing && <button type="button" className="btn-quiet min-h-[40px] text-sm" onClick={playback.skip}><SkipForward size={16} aria-hidden="true" /> {s.showAll}</button>}
                {finished && all.length > 1 && <button type="button" className="btn-quiet min-h-[40px] text-sm" onClick={playback.play}><Play size={16} aria-hidden="true" /> {s.replay}</button>}
              </div>
              {shown?.streaming && !all.length && !working.length && <p className="text-sm text-ink-600" role="status">{s.waiting}</p>}
              <Conversation messages={visible} s={s} tasksById={tasksById} offsets={offsets} runId={runId}
                linkSteps={!shown?.streaming} working={working} />
            </section>
          )}

          {finished && all.length > 0 && (
            <div className="mt-8">
              <DecisionCard decision={finalDecision(all)} stats={statsOf(all)} s={s} tasksById={tasksById} actions={actions} />
            </div>
          )}

          {!ctx.back && finished && (
            <section className="mt-10 border-t border-limestone-300 pt-6" aria-labelledby="more-h">
              <h2 id="more-h" className="flex items-center gap-2 font-semibold"><History size={16} aria-hidden="true" /> {s.otherRuns}</h2>
              {others.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {others.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => navigate(`/decided?run=${r.id}`)} className="w-full rounded px-2 py-2 text-left text-sm hover:bg-limestone/60">
                        <span className="block truncate font-medium">{r.title || r.kind}</span>
                        <span className="text-xs text-ink-500">{stamp(r.started_at)} · {messagesOf(r).length} messages</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-outline min-h-[44px]" onClick={runSample} disabled={live.status === 'running'}><Sparkles size={16} aria-hidden="true" /> {s.runSample}</button>
                {shown?.kind !== 'recorded' && <Link to={`/decided?run=${RECORDED}`} className="btn-outline min-h-[44px]"><Play size={16} aria-hidden="true" /> {s.playRecorded}</Link>}
              </div>
              <p className="mt-2 text-sm text-ink-500">{s.sampleHint}</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
