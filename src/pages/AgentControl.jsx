import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { usePageMeta } from '../lib/seo.js';
import { api } from '../lib/api.js';
import { demoRequest, clearRuns, savedRuns, useAgentRun } from '../lib/agentRun.js';
import { Link, useRouter } from '../lib/router.jsx';
import { RECORDED, messagesOf } from '../lib/decided.js';
import AgentFlow, { STATUS } from '../components/mission/AgentFlow.jsx';
import { EventLog, TaskDetails, Timeline } from '../components/mission/RunDetails.jsx';

const KIND = { plan: 'Trip analysis', simulation: 'What-if simulation', guardian: 'Guardian check' };

export default function AgentControl() {
  usePageMeta({
    title: 'Agent Control Center',
    description: 'Watch Raahi’s agents work: which agent ran, what it was asked, the tools it called, how long it took, retries, errors and what it contributed.',
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

  return (
    <main id="main" className="mission min-h-screen pb-20 pt-16">
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6">
        <p className="m-label text-[#4CC9F0]">Real execution, not animation</p>
        <h1 className="type-wide mt-2 text-3xl font-extrabold sm:text-5xl">Agent Control Center</h1>
        <p className="mt-3 max-w-prose text-ink-600">
          Every box below is a task the server actually ran: when it was queued, started and finished, the tools it called,
          its inputs and outputs, errors, retries, and who asked it to run. Nothing here is simulated.
        </p>

        <form className="m-card mt-8 flex flex-col gap-2 p-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (message.trim()) start(message); }}>
          <label htmlFor="cc-msg" className="sr-only">Trip request for the agents</label>
          <input id="cc-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
            placeholder="Give the agents a trip request…"
            className="min-h-[44px] flex-1 rounded-md border border-white/15 bg-black/30 px-3 text-ink placeholder:text-ink-500 focus:border-[#4CC9F0] focus:outline-none" />
          <button type="submit" className="btn bg-[#4CC9F0] text-[#04121A] hover:bg-[#7DD8F5]" disabled={showingLive || !message.trim()}>
            <Play size={16} aria-hidden="true" /> Run
          </button>
          <button type="button" className="btn border border-white/15 text-ink hover:bg-white/5" disabled={showingLive}
            onClick={() => { const demo = demoRequest(); setMessage(demo); start(demo); }}>Run the demo</button>
        </form>
        {live.error && <p className="mt-3 rounded-md border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{live.error.message}</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
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
              {!runs.length && !showingLive && <p className="mt-2 text-sm text-ink-500">No runs yet. Start one above or from the Travel Twin.</p>}
              <ul className="mt-2 flex flex-col gap-1">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => { setRunId(r.id); setSelected(null); }} aria-current={!showingLive && r.id === runId ? 'true' : undefined}
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-white/5 aria-[current=true]:bg-white/10">
                      <span className="block truncate font-medium">{r.title || KIND[r.kind]}</span>
                      <span className="text-xs text-ink-500">{KIND[r.kind] || r.kind} · {r.tasks.length} tasks · {r.duration_ms} ms</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="m-card p-4">
              <h2 className="font-semibold">The agents</h2>
              {roster?.error && <p className="mt-2 text-sm text-[#FF8A75]">Couldn’t load the agent list from the server.</p>}
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {(roster?.agents || []).map((a) => {
                  const t = tasks.filter((x) => x.agent === a.name).at(-1);
                  const s = STATUS[t?.status || 'idle'];
                  return (
                    <li key={a.name}>
                      <span className="flex items-center gap-2 font-medium"><span className="status-dot" style={{ background: s.color }} aria-hidden="true" />{a.label}
                        <span className="sr-only">: {s.label}</span></span>
                      <span className="block pl-4 text-xs text-ink-500">{a.description}</span>
                    </li>
                  );
                })}
                {(roster?.planned || []).map((a) => (
                  <li key={a.name} className="text-ink-500"><span className="font-medium">{a.label}</span> <span className="text-xs">({a.status})</span></li>
                ))}
              </ul>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="flow-h" className="m-card p-4 sm:p-5">
              <h2 id="flow-h" className="type-semiwide text-lg font-bold">
                {showingLive ? 'Live workflow' : run ? `Workflow: ${run.title || KIND[run.kind]}` : 'Workflow'}
              </h2>
              {isRecorded && (
                <p className="mt-1 rounded border border-[#F5B841]/40 bg-[#F5B841]/10 px-2 py-1 text-xs text-ink">
                  Recorded run, not live: {recorded?.note || 'a real run of Raahi’s agents, played back.'}
                </p>
              )}
              {run && <p className="text-xs text-ink-500">Run {run.id} · started {run.started_at?.slice(0, 10)} {run.started_at?.slice(11, 19)} UTC · {run.duration_ms} ms</p>}
              {conversationLink && <Link to={conversationLink} className="mt-1 inline-block text-sm font-semibold text-[#4CC9F0] hover:underline">How the agents decided ({messages.length} messages)</Link>}
              <div className="mt-3">
                {tasks.length ? <AgentFlow tasks={tasks} selected={selected} onSelect={setSelected} />
                  : <p className="text-sm text-ink-500">Nothing to show yet. Every agent is idle.</p>}
              </div>
            </section>
            {tasks.length > 0 && (
              <div className="grid gap-6 xl:grid-cols-2">
                <section aria-labelledby="detail-h" ref={detailRef} className="m-card min-w-0 scroll-mt-24 p-4 sm:p-5">
                  <h2 id="detail-h" className="sr-only">Task details</h2>
                  <TaskDetails task={task} byId={byId} messages={messages} conversationLink={conversationLink} />
                </section>
                <section aria-labelledby="time-h" className="m-card min-w-0 p-4 sm:p-5">
                  <h2 id="time-h" className="font-semibold">Timeline</h2>
                  <div className="mt-3"><Timeline tasks={tasks} startedAt={run?.started_at} onSelect={setSelected} /></div>
                  <h2 className="mt-6 font-semibold">Event log</h2>
                  <div className="mt-2"><EventLog events={events} byId={byId} /></div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
