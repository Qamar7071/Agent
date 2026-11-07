// Agent Control Center: what Raahi's agents actually did on a run, from the server's own records.
// The stages view (lib/pipeline.js) and the graph are two drawings of the same real tasks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, GitBranch, ListTree, MessagesSquare, Play, ShieldQuestion, Trash2, Workflow } from 'lucide-react';
import { usePageMeta } from '../lib/seo.js';
import { api } from '../lib/api.js';
import { demoRequest, clearRuns, savedRuns, useAgentRun } from '../lib/agentRun.js';
import { Link, useRouter } from '../lib/router.jsx';
import { RECORDED, messagesOf } from '../lib/decided.js';
import { duration, progress } from '../lib/pipeline.js';
import AgentFlow, { STATUS } from '../components/mission/AgentFlow.jsx';
import AgentPipeline from '../components/mission/AgentPipeline.jsx';
import { EventLog, TaskDetails, Timeline } from '../components/mission/RunDetails.jsx';
import { AgentAvatar } from '../components/ui/AgentAvatar.jsx';
import { tabKeyDown } from '../lib/tabKeys.js';

const KIND = { plan: 'Trip analysis', simulation: 'What-if simulation', guardian: 'Guardian check', consensus: 'Group options' };
const VERDICT = { pass: 'Passed', pass_with_warnings: 'Passed with warnings', needs_approval: 'Waiting for your decision', fail: 'Failed' };

function Roster({ roster, tasks }) {
  const byAgent = {};
  tasks.forEach((t) => { byAgent[t.agent] = t; });
  const agents = roster?.agents || [];
  return (
    <section aria-labelledby="roster-h" className="m-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="roster-h" className="type-semiwide text-lg font-bold">The agents</h2>
        <p className="text-xs text-ink-500">{agents.length ? `${agents.length} on the server` : ''}{tasks.length ? ` · ${new Set(tasks.map((t) => t.agent)).size} in this run` : ''}</p>
      </div>
      {roster?.error && <p className="mt-2 text-sm text-[#FF8A75]">Couldn’t load the agent list from the server.</p>}
      {!roster && <div className="mt-3 grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <span key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />)}</div>}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {agents.map((a) => {
          const t = byAgent[a.name];
          const s = STATUS[t?.status || 'idle'];
          return (
            <li key={a.name} className={`flex gap-3 rounded-xl border p-3 ${t ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
              <AgentAvatar agent={a.name} label={a.label} size={36} className={t ? '' : 'opacity-60'} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{a.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-ink-500">
                    <span className={`status-dot ${t?.status === 'running' ? 'animate-breathe' : ''}`} style={{ background: s.color }} aria-hidden="true" />
                    {t ? s.label : 'Not in this run'}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{a.description}</p>
                {t?.duration_ms != null && <p className="num mt-0.5 text-[11px] text-ink-600">{duration(t.duration_ms)}{t.tool_calls?.length ? ` · ${t.tool_calls.length} tool calls` : ''}{t.retries ? ` · ${t.retries} retries` : ''}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {(roster?.planned || []).length > 0 && (
        <p className="mt-3 text-xs text-ink-500">Planned, not built yet: {roster.planned.map((a) => a.label).join(', ')}.</p>
      )}
    </section>
  );
}

function Validation({ run, tasks }) {
  const task = [...tasks].reverse().find((t) => t.agent === 'validation');
  if (!task) return null;
  const full = run?.validation;
  const out = task.outputs || {};
  const verdict = full?.verdict || out.verdict;
  const checks = full?.checks || [];
  const decisions = full?.decisions || [];
  const passed = checks.length ? checks.filter((c) => c.ok).length : out.checks_passed;
  const total = checks.length || out.checks;
  const tone = verdict === 'fail' ? 'text-[#FF8A75]' : verdict === 'needs_approval' ? 'text-[#C4B5FD]' : verdict === 'pass_with_warnings' ? 'text-[#F5B841]' : 'text-[#3DDC97]';
  return (
    <section aria-labelledby="valid-h" className="m-card p-4 sm:p-5">
      <h2 id="valid-h" className="type-semiwide flex items-center gap-2 text-lg font-bold"><BadgeCheck size={18} className="text-[#3DDC97]" aria-hidden="true" /> Validation</h2>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{VERDICT[verdict] || verdict || 'Not run'}{total ? ` · ${passed}/${total} checks passed` : ''}</p>
      {checks.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.name} className="flex gap-2">
              <span aria-hidden="true" className={c.ok ? 'text-[#3DDC97]' : c.severity === 'warning' ? 'text-[#F5B841]' : c.severity === 'decision' ? 'text-[#C4B5FD]' : 'text-[#FF8A75]'}>{c.ok ? '✓' : '!'}</span>
              <span className="sr-only">{c.ok ? 'Passed:' : 'Not passed:'}</span>
              <span className="text-ink-700">{c.message}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-ink-500">The full list of checks is kept for runs started in this browser.</p>}
      {decisions.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#A78BFA]/40 bg-[#A78BFA]/[0.08] p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#C4B5FD]"><ShieldQuestion size={16} aria-hidden="true" /> Yours to decide</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-700">{decisions.map((d) => <li key={d.code}>{d.message}</li>)}</ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-500">Validation cross-checks every agent: plan against budget, forecast dates against plan dates, a risk score for every day, and no claims of open roads, bookings or guarantees.</p>
    </section>
  );
}

export default function AgentControl() {
  usePageMeta({
    title: 'Agent Control Center',
    description: 'Watch Raahi’s twelve agents work: the stages they run in, what each was asked, the tools it called, how long it took, retries, validation and what it contributed.',
    path: '/agents',
  });
  const { query } = useRouter();
  const live = useAgentRun();
  const [roster, setRoster] = useState(null);
  const [runs, setRuns] = useState(savedRuns);
  const [runId, setRunId] = useState(() => query.get('run') || savedRuns()[0]?.id || null);
  const [selected, setSelected] = useState(() => query.get('task'));
  const [message, setMessage] = useState('');
  const [recorded, setRecorded] = useState(null);
  const [view, setView] = useState('stages');
  const detailRef = useRef(null);

  // Links from "How the agents decided" open a run at one step: /agents?run=<id>&task=<step>.
  const qRun = query.get('run');
  const qTask = query.get('task');
  useEffect(() => {
    if (qRun) setRunId(qRun);
    if (qTask) setSelected(qTask);
  }, [qRun, qTask]);
  useEffect(() => {
    if (runId === RECORDED && !recorded) import('../data/demo-run.json').then((m) => setRecorded(m.default)).catch(() => {});
  }, [runId, recorded]);

  useEffect(() => {
    api.agentRoster().then(setRoster).catch(() => setRoster({ agents: [], error: true }));
  }, []);
  useEffect(() => {
    if (live.status === 'done' && live.run) {
      setRuns(savedRuns());
      setRunId(live.run.id);
    }
  }, [live.status, live.run]);

  const showingLive = live.status === 'running';
  const isRecorded = !showingLive && runId === RECORDED;
  const run = showingLive ? null : isRecorded ? recorded && { ...recorded.run, title: `${recorded.label}: ${recorded.message}` } : runs.find((r) => r.id === runId);
  const tasks = showingLive ? live.tasks : run?.tasks || [];
  const events = showingLive ? live.events : run?.events || [];
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const task = selected ? byId[selected] : null;
  const messages = useMemo(() => messagesOf(run), [run]);
  const conversationLink = run && messages.length ? `/decided?run=${isRecorded ? RECORDED : run.id}` : null;
  const p = progress(tasks);
  // A saved or recorded run opens on its Validation step, so the details panel is never empty.
  useEffect(() => {
    if (showingLive || selected || qTask || !run?.tasks?.length) return;
    const v = [...run.tasks].reverse().find((t) => t.agent === 'validation');
    setSelected((v || run.tasks[0]).id);
  }, [run, showingLive]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrolledTo = useRef(null);
  useEffect(() => {
    if (qTask && task?.id === qTask && scrolledTo.current !== qTask) {
      scrolledTo.current = qTask;                  // once per link, not on every later click
      detailRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [qTask, task]);

  const start = (msg) => {
    setSelected(null);
    live.start(api.runAgents, { message: msg }, msg.slice(0, 60));
  };
  const select = (id) => {
    setSelected(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  return (
    <main id="main" className="mission min-h-screen pb-20 pt-16">
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6">
        <p className="m-label text-[#4CC9F0]">Real execution, not animation</p>
        <h1 className="type-wide mt-2 text-3xl font-extrabold sm:text-5xl">Agent Control Center</h1>
        <p className="mt-3 max-w-prose text-ink-600">
          A Master Orchestrator and eleven specialists. Every card below is a task the server actually ran: when it started
          and finished, the tools it called, its inputs and outputs, retries, errors and who asked it to run. Nothing here
          is simulated.
        </p>

        <form className="m-card mt-8 flex flex-col gap-2 p-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (message.trim()) start(message); }}>
          <label htmlFor="cc-msg" className="sr-only">Trip request for the agents</label>
          <input id="cc-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
            placeholder="Give the agents a trip request, in English or Roman Urdu…"
            className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 text-ink placeholder:text-ink-500 focus:border-[#4CC9F0] focus:outline-none" />
          <button type="submit" className="btn bg-[#4CC9F0] text-[#04121A] hover:bg-[#7DD8F5]" disabled={showingLive || !message.trim()}>
            <Play size={16} aria-hidden="true" /> Run
          </button>
          <button type="button" className="btn border border-white/15 text-ink hover:bg-white/5" disabled={showingLive}
            onClick={() => { const demo = demoRequest(); setMessage(demo); start(demo); }}>Run the demo</button>
          <Link to={`/agents?run=${RECORDED}`} className="btn border border-white/15 text-ink hover:bg-white/5">Recorded run</Link>
        </form>
        {live.error && <p className="mt-3 rounded-lg border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{live.error.message}</p>}

        <div className="mt-6 grid gap-6 xl:grid-cols-[280px_1fr]">
          <aside aria-labelledby="runs-h" className="flex min-w-0 flex-col gap-4">
            <div className="m-card p-4">
              <div className="flex items-baseline justify-between">
                <h2 id="runs-h" className="font-semibold">Runs in this browser</h2>
                {runs.length > 0 && (
                  <button type="button" className="btn-quiet min-h-[32px] px-1.5 text-ink-500" onClick={() => { clearRuns(); setRuns([]); setRunId(null); }}
                    aria-label="Clear saved runs"><Trash2 size={14} aria-hidden="true" /></button>
                )}
              </div>
              {showingLive && <p className="mt-2 text-sm text-[#4CC9F0]" role="status">A run is in progress…</p>}
              {!runs.length && !showingLive && <p className="mt-2 text-sm text-ink-500">No runs yet. Start one above, open the recorded run, or run agents from the Travel Twin or Guardian.</p>}
              <ul className="mt-2 flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => { setRunId(r.id); setSelected(null); }} aria-current={!showingLive && r.id === runId ? 'true' : undefined}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5 aria-[current=true]:bg-white/10">
                      <span className="block truncate font-medium">{r.title || KIND[r.kind]}</span>
                      <span className="text-xs text-ink-500">{KIND[r.kind] || r.kind} · {r.tasks.length} tasks · {duration(r.duration_ms)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="flow-h" className="m-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="flow-h" className="type-semiwide text-lg font-bold">
                    {showingLive ? 'Live workflow' : run ? `Workflow: ${run.title || KIND[run.kind]}` : 'Workflow'}
                  </h2>
                  {run && <p className="text-xs text-ink-500">Run {run.id} · started {run.started_at?.slice(0, 10)} {run.started_at?.slice(11, 19)} UTC · {duration(run.duration_ms)}</p>}
                </div>
                {tasks.length > 0 && (
                  <div role="tablist" aria-label="Workflow view" className="flex rounded-full bg-black/30 p-1">
                    {[['stages', 'Stages', ListTree], ['graph', 'Graph', GitBranch]].map(([id, label, Icon]) => (
                      <button key={id} id={`view-${id}`} type="button" role="tab" aria-selected={view === id}
                        tabIndex={view === id ? 0 : -1} onClick={() => setView(id)}
                        onKeyDown={(e) => tabKeyDown(e, ['stages', 'graph'], view, setView, (x) => `view-${x}`)}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${view === id ? 'bg-white/15 text-ink' : 'text-ink-500 hover:text-ink'}`}>
                        <Icon size={15} aria-hidden="true" /> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isRecorded && (
                <p className="mt-2 rounded-lg border border-[#F5B841]/40 bg-[#F5B841]/10 px-2 py-1 text-xs text-ink">
                  Recorded run, not live: {recorded?.note || 'a real run of Raahi’s agents, played back.'}
                </p>
              )}
              {tasks.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {[['Agents finished', `${p.done}/${p.total}`], ['Working now', p.running], ['Tool calls', p.tools], ['Retries', p.retries]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/[0.04] px-3 py-2"><dt className="text-xs text-ink-500">{k}</dt><dd className="num font-bold">{v}</dd></div>
                  ))}
                </dl>
              )}
              {conversationLink && (
                <Link to={conversationLink} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#4CC9F0] hover:underline">
                  <MessagesSquare size={15} aria-hidden="true" /> How the agents decided ({messages.length} messages)
                </Link>
              )}
              <div className="mt-4" role="tabpanel">
                {!tasks.length && (
                  <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-white/15 p-6">
                    <Workflow size={24} className="text-[#4CC9F0]" aria-hidden="true" />
                    <p className="text-sm text-ink-600">Nothing to show yet: every agent is idle. Give them a request, run the demo, or open the recorded run.</p>
                  </div>
                )}
                {tasks.length > 0 && view === 'stages' && <AgentPipeline tasks={tasks} selected={selected} onSelect={select} dark />}
                {tasks.length > 0 && view === 'graph' && <AgentFlow tasks={tasks} selected={selected} onSelect={select} />}
              </div>
            </section>

            {tasks.length > 0 && (
              <div className="grid gap-6 xl:grid-cols-2">
                <section aria-labelledby="detail-h" ref={detailRef} className="m-card min-w-0 scroll-mt-24 p-4 sm:p-5">
                  <h2 id="detail-h" className="sr-only">Task details</h2>
                  <TaskDetails task={task} byId={byId} messages={messages} conversationLink={conversationLink} />
                </section>
                <div className="flex min-w-0 flex-col gap-6">
                  <Validation run={run} tasks={tasks} />
                  <section aria-labelledby="time-h" className="m-card min-w-0 p-4 sm:p-5">
                    <h2 id="time-h" className="font-semibold">Timeline</h2>
                    <div className="mt-3"><Timeline tasks={tasks} startedAt={run?.started_at} onSelect={select} /></div>
                    <h2 className="mt-6 font-semibold">Event log</h2>
                    <div className="mt-2"><EventLog events={events} byId={byId} /></div>
                  </section>
                </div>
              </div>
            )}

            <Roster roster={roster} tasks={tasks} />
          </div>
        </div>
      </div>
    </main>
  );
}
