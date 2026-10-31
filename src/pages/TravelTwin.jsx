import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, FlaskConical, Play, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react';
import { usePageMeta } from '../lib/seo.js';
import { api } from '../lib/api.js';
import { demoRequest, useAgentRun } from '../lib/agentRun.js';
import { Link, useRouter } from '../lib/router.jsx';
import { read, write } from '../lib/store.js';
import { usePlanner } from '../context/PlannerContext.jsx';
import { pkr } from '../lib/format.js';
import MiniMarkdown from '../components/ui/MiniMarkdown.jsx';
import AgentFlow from '../components/mission/AgentFlow.jsx';
import TerrainTwin from '../components/mission/TerrainTwin.jsx';

const DEMO_SCENARIO = 'What if the Khunjerab route becomes unavailable on Day 4?';
const KEY = 'raahi:twin:v1';
const FALLBACK_PRESETS = [
  { label: 'A road becomes unavailable', example: 'What if the Khunjerab route is closed from day 4?' },
  { label: 'Heavy snowfall', example: 'What if heavy snow falls from day 2?' },
  { label: 'Budget drops by 20%', example: 'What if my budget decreases by 20%?' },
  { label: 'One day less', example: 'What if I remove one day?' },
  { label: 'A place becomes inaccessible', example: 'What if Attabad Lake is inaccessible?' },
  { label: 'Extend the trip', example: 'What if I extend the trip by 2 days?' },
  { label: 'More people', example: 'What if 2 more people join?' },
  { label: 'More adventure', example: 'What if we want more adventure activities?' },
];
const RISK_COLOR = { Low: 'text-[#3DDC97]', Moderate: 'text-[#F5B841]', High: 'text-[#FF6B5B]', Severe: 'text-[#FF6B5B]' };

function slim(res) {
  const { plan, run, ...rest } = res;
  return { ...rest, runId: run?.id, title: plan?.title };
}

function Metric({ label, value, sub, tone = '' }) {
  return (
    <div className="m-card p-3.5">
      <p className="m-label">{label}</p>
      <p className={`num mt-1 text-xl font-bold leading-tight ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

function Delta({ label, a, b, fmt = (v) => v, good = 'down' }) {
  const d = typeof a === 'number' && typeof b === 'number' ? b - a : null;
  const better = d == null || d === 0 ? null : good === 'down' ? d < 0 : d > 0;
  return (
    <div className="m-card p-3">
      <p className="m-label">{label}</p>
      <p className="num mt-1 text-sm text-ink-600">{fmt(a)} → <span className="text-base font-bold text-ink">{fmt(b)}</span></p>
      {d != null && d !== 0 && (
        <p className={`num text-xs font-semibold ${better ? 'text-[#3DDC97]' : 'text-[#F5B841]'}`}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</p>
      )}
      {d === 0 && <p className="text-xs text-ink-500">No change</p>}
    </div>
  );
}

function Compare({ sim, onAccept, onReject, busy }) {
  const c = sim.comparison;
  const o = sim.original;
  const s = sim.simulated;
  return (
    <section aria-labelledby="sim-h" className="m-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-label">Scenario</p>
          <h3 id="sim-h" className="type-semiwide text-xl font-bold">{sim.scenario.label}</h3>
          <p className="mt-1 text-sm text-ink-600">Confidence: <strong className="text-ink">{sim.confidence}</strong>. {sim.confidence_reason}</p>
        </div>
        <span className="rounded-full border border-[#A78BFA]/50 bg-[#A78BFA]/10 px-3 py-1 text-xs font-semibold text-[#C4B5FD]">
          Original plan unchanged until you accept
        </span>
      </div>
      <p className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm">
        <Sparkles size={15} className="mr-1.5 inline text-[#3DDC97]" aria-hidden="true" />{sim.recommendation.text}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Delta label="Days" a={c.length.original} b={c.length.simulated} good="none" />
        <Delta label="Cost" a={c.cost.original} b={c.cost.simulated} fmt={pkr} />
        <Delta label="Hours on the move" a={c.time.original[1]} b={c.time.simulated[1]} fmt={(v) => `${v} h`} />
        {c.risk && <Delta label="Risk score" a={c.risk.original} b={c.risk.simulated} fmt={(v) => `${v}/100`} />}
        {c.eco && <Delta label="CO2e (kg, high)" a={c.eco.original[1]} b={c.eco.simulated[1]} />}
      </div>
      {(sim.changes?.length > 0 || sim.assumptions?.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {sim.changes?.length > 0 && (
            <div><p className="m-label">What the agents changed</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">{sim.changes.map((x) => <li key={x}>{x}</li>)}</ul></div>
          )}
          <div><p className="m-label">Assumptions</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">{sim.assumptions.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      )}
      {(c.route.removed.length > 0 || c.route.added.length > 0) && (
        <p className="mt-3 text-sm text-ink-700">
          <span className="m-label mr-2">Route</span>
          {c.route.removed.map((r) => <span key={r} className="mr-2 text-[#FF8A75] line-through">{r}</span>)}
          {c.route.added.map((r) => <span key={r} className="mr-2 text-[#3DDC97]">+ {r}</span>)}
        </p>
      )}
      <div className="mt-5 overflow-x-auto" role="region" aria-label="Original and simulated days" tabIndex={0}>
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs text-ink-500">
              <th scope="col" className="w-14 py-2 font-semibold">Day</th>
              <th scope="col" className="py-2 font-semibold">Original</th>
              <th scope="col" className="py-2 font-semibold">Simulated</th>
            </tr>
          </thead>
          <tbody>
            {c.days.map((d) => (
              <tr key={d.day} className={`border-t border-white/10 align-top ${d.status === 'changed' ? 'bg-[#F5B841]/[0.06]' : d.status === 'added' ? 'bg-[#3DDC97]/[0.06]' : d.status === 'removed' ? 'bg-[#FF6B5B]/[0.06]' : ''}`}>
                <th scope="row" className="py-2 font-semibold">
                  {d.day}
                  {d.status !== 'same' && <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#F5B841]">{d.status}</span>}
                </th>
                <td className="py-2 pr-3 text-ink-600">{d.original ? <>{d.original.title}<span className="block text-xs text-ink-500">{d.original.moves.join(', ') || 'No travel'}</span></> : '—'}</td>
                <td className="py-2 text-ink">{d.simulated ? <>{d.simulated.title}<span className="block text-xs text-ink-500">{d.simulated.moves.join(', ') || 'No travel'}</span></> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.profile?.length > 1 && (
        <div className="mt-5">
          <p className="m-label mb-1">Simulated route</p>
          <TerrainTwin profile={s.profile} riskByDay={s.risk?.by_day} title={s.title} />
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {sim.recommendation.action !== 'keep' && (
          <button type="button" className="btn bg-[#3DDC97] text-[#06140F] hover:bg-[#6BE7B2]" onClick={onAccept} disabled={busy}>
            <Check size={16} aria-hidden="true" /> Accept this plan
          </button>
        )}
        <button type="button" className="btn border border-white/15 text-ink hover:bg-white/5" onClick={onReject} disabled={busy}>
          <X size={16} aria-hidden="true" /> {sim.recommendation.action === 'keep' ? 'Close' : 'Keep the original'}
        </button>
      </div>
      <p className="mt-3 text-xs text-ink-500">Original: {o.title}, {pkr(o.total_pkr)}. Simulated: {s.title}, {pkr(s.total_pkr)}. Costs are estimates.</p>
    </section>
  );
}

export default function TravelTwin() {
  usePageMeta({
    title: 'Travel Twin',
    description: 'Raahi’s Travel Twin: specialist AI agents build a virtual copy of your trip, then test what-if scenarios such as road closures, snowfall or a smaller budget, and compare the results.',
    path: '/twin',
  });
  const { itinerary, buildPlan } = usePlanner();
  const { query, navigate } = useRouter();
  const plan = useAgentRun();
  const sim = useAgentRun();
  const [saved, setSaved] = useState(() => read(KEY, null));
  const [message, setMessage] = useState('');
  const [whatIf, setWhatIf] = useState('');
  const [presets, setPresets] = useState(FALLBACK_PRESETS);
  const [simResult, setSimResult] = useState(null);
  const [history, setHistory] = useState(() => read(`${KEY}:history`, []));
  const twin = saved?.twin;

  useEffect(() => {
    api.twinPresets().then((r) => setPresets(r.presets)).catch(() => {});
  }, []);

  const keep = (res, title) => {
    const value = { ...slim(res), savedAt: new Date().toISOString(), title };
    setSaved(value);
    write(KEY, value);
  };

  const runAgents = async (payload, title) => {
    setSimResult(null);
    const res = await plan.start(api.runAgents, payload, title);
    if (res) keep(res, title);
    return res;
  };

  useEffect(() => {
    if (query.get('from') === 'plan' && itinerary) {
      navigate('/twin', { replace: true });
      runAgents({ request: itinerary.request }, itinerary.title);
    } else if (query.get('demo') === '1') {
      navigate('/twin', { replace: true });
      const demo = demoRequest();
      setMessage(demo);
      runAgents({ message: demo }, 'Demo: Hunza and Khunjerab');
    }
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const simulate = async (body, label) => {
    if (!twin) return;
    setSimResult(null);
    const res = await sim.start(api.simulate, { request: twin.request, ...body }, `What if: ${label}`);
    if (res) {
      setSimResult(res);
      if (res.ok && !res.no_alternative) {
        const h = [{ label: res.scenario.label, at: new Date().toISOString(), decision: 'pending', text: res.recommendation.text }, ...history].slice(0, 12);
        setHistory(h);
        write(`${KEY}:history`, h);
      }
    }
  };

  const decide = async (decision) => {
    const h = history.map((x, i) => (i === 0 ? { ...x, decision } : x));
    setHistory(h);
    write(`${KEY}:history`, h);
    if (decision === 'accepted' && simResult) {
      const req = simResult.simulated_request;
      setSimResult(null);
      await runAgents({ request: req }, `Accepted: ${simResult.scenario.label}`);
    } else {
      setSimResult(null);
    }
  };

  const openInPlanner = async () => {
    if (!twin) return;
    await buildPlan(twin.request);
    navigate('/plan');
  };

  const agents = saved?.agents || {};
  const sum = twin?.summary;
  const decisions = saved?.validation?.decisions || [];
  const busy = plan.status === 'running' || sim.status === 'running';
  const liveTasks = useMemo(() => plan.tasks, [plan.tasks]);

  return (
    <main id="main" className="mission min-h-screen pb-20 pt-16">
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6">
        <p className="m-label text-[#4CC9F0]">Raahi AI · Beyond travel planning. Predicting every journey.</p>
        <h1 className="type-wide mt-2 text-3xl font-extrabold sm:text-5xl">Travel Twin</h1>
        <p className="mt-3 max-w-prose text-ink-600">
          Specialist agents build a virtual copy of your trip from Raahi’s road data, live forecasts and official alerts.
          Then test it: close a road, add snow, cut the budget. Each scenario runs on a copy, so your plan only changes
          if you accept.
        </p>

        <form className="m-card mt-8 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (message.trim()) runAgents({ message }, message.slice(0, 60)); }}>
          <label htmlFor="twin-msg" className="m-label">Describe your trip</label>
          <textarea id="twin-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
            placeholder="e.g. 6 days in Skardu from Islamabad for 2 people in May, budget Rs 1,50,000"
            className="mt-2 block w-full resize-y rounded-md border border-white/15 bg-black/30 px-3 py-2.5 text-base text-ink placeholder:text-ink-500 focus:border-[#4CC9F0] focus:outline-none" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="btn bg-[#4CC9F0] text-[#04121A] hover:bg-[#7DD8F5]" disabled={busy || !message.trim()}>
              <Play size={16} aria-hidden="true" /> Run the agents
            </button>
            <button type="button" className="btn border border-white/15 text-ink hover:bg-white/5" disabled={busy}
              onClick={() => { const demo = demoRequest(); setMessage(demo); runAgents({ message: demo }, 'Demo: Hunza and Khunjerab'); }}>
              <Sparkles size={16} aria-hidden="true" /> Run the demo trip
            </button>
            {itinerary && (
              <button type="button" className="btn border border-white/15 text-ink hover:bg-white/5" disabled={busy}
                onClick={() => runAgents({ request: itinerary.request }, itinerary.title)}>
                Use my current plan ({itinerary.title})
              </button>
            )}
            {busy && <button type="button" className="btn-quiet text-ink-600" onClick={() => { plan.cancel(); sim.cancel(); }}>Cancel</button>}
          </div>
          <p className="mt-2 text-xs text-ink-500">The demo starts in Gilgit (you would fly or drive there first) so day 4 is the Khunjerab Pass day.</p>
        </form>

        {(plan.status === 'running' || (plan.tasks.length > 0 && plan.status !== 'idle')) && (
          <section aria-labelledby="live-h" className="m-card mt-6 p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="live-h" className="type-semiwide text-lg font-bold">
                {plan.status === 'running' ? 'Agents at work' : 'How the agents built this'}
              </h2>
              {plan.run && <Link to={`/agents?run=${plan.run.id}`} className="text-sm font-semibold text-[#4CC9F0] hover:underline">Open in Agent Control Center <ArrowRight size={14} className="inline" aria-hidden="true" /></Link>}
            </div>
            <p className="sr-only" role="status">{plan.status === 'running' ? `${plan.tasks.filter((t) => t.status === 'completed').length} agents finished` : ''}</p>
            <div className="mt-3"><AgentFlow tasks={liveTasks} compact /></div>
          </section>
        )}
        {plan.error && <p className="mt-4 rounded-md border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{plan.error.message}</p>}

        {twin && sum && (
          <section aria-labelledby="twin-h" className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-label">Your trip’s twin</p>
                <h2 id="twin-h" className="type-wide text-2xl font-extrabold sm:text-3xl">{sum.title}</h2>
                <p className="text-sm text-ink-500">Built {new Date(twin.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}. Data reviewed {twin.data_reviewed}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={openInPlanner} className="btn border border-white/15 text-ink hover:bg-white/5">Open in planner</button>
                <Link to="/guardian?from=twin" className="btn border border-white/15 text-ink hover:bg-white/5"><ShieldAlert size={16} aria-hidden="true" /> Check with Guardian</Link>
              </div>
            </div>
            <div className="m-card mt-4 p-3 sm:p-4">
              <TerrainTwin profile={sum.profile} riskByDay={sum.risk?.by_day} title={sum.title} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Metric label="Days" value={sum.days} sub={sum.feasible ? 'Fits the route' : 'Too short for the route'} />
              <Metric label="Estimated cost" value={pkr(sum.total_pkr)} sub={`${pkr(sum.per_person_pkr)} per person · ${sum.budget_status.replace('_', ' ')}`} />
              <Metric label="On the move" value={`${sum.travel_hours[0]}–${sum.travel_hours[1]} h`} sub={`${sum.road_km} km by road`} />
              {sum.risk && <Metric label="Risk (heuristic)" value={`${sum.risk.category} · ${sum.risk.score}`} sub={`Confidence ${sum.risk.confidence}`} tone={RISK_COLOR[sum.risk.category]} />}
              {sum.eco_kg_co2e && <Metric label="Transport CO2e" value={`${sum.eco_kg_co2e[0]}–${sum.eco_kg_co2e[1]} kg`} sub="Estimate, not a measurement" />}
              <Metric label="Weather" value={agents.weather?.day_weather?.length ? `${agents.weather.day_weather.length} days` : 'No forecast'}
                sub={agents.weather?.day_weather?.length ? 'Open-Meteo forecast' : (agents.weather?.reason || 'Add dates for a forecast')} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="m-card p-4 sm:p-5">
                <p className="m-label">Coordinated answer {saved.answer_mode === 'ai' ? '(worded by the AI model)' : '(from the agents’ results)'}</p>
                <div className="mt-2 text-sm leading-relaxed text-ink-700"><MiniMarkdown text={saved.answer} /></div>
              </div>
              <div className="flex flex-col gap-4">
                {decisions.length > 0 && (
                  <div className="m-card border-[#A78BFA]/40 p-4">
                    <p className="m-label text-[#C4B5FD]">Waiting for your decision</p>
                    {decisions.map((d) => (
                      <div key={d.code} className="mt-2">
                        <p className="text-sm">{d.message}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {d.options.map((o) => (
                            <button key={o.label} type="button" disabled={busy} className="btn min-h-[36px] border border-[#A78BFA]/50 px-3 text-sm text-ink hover:bg-[#A78BFA]/10"
                              onClick={() => runAgents({ request: { ...twin.request, ...o.change } }, `${sum.title}: ${o.label}`)}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="m-card p-4">
                  <p className="m-label">Validation</p>
                  <p className="mt-1 text-sm">{saved.validation?.verdict?.replaceAll('_', ' ') || 'not run'}</p>
                  <ul className="mt-2 flex flex-col gap-1 text-xs">
                    {(saved.validation?.checks || []).map((c) => (
                      <li key={c.name} className="flex gap-2"><span className={c.ok ? 'text-[#3DDC97]' : c.severity === 'warning' ? 'text-[#F5B841]' : 'text-[#C4B5FD]'}>{c.ok ? '✓' : '!'}</span><span className="text-ink-600">{c.message}</span></li>
                    ))}
                  </ul>
                </div>
                {twin.assumed?.length > 0 && (
                  <div className="m-card p-4"><p className="m-label">Assumed</p><p className="mt-1 text-sm text-ink-600">{twin.assumed.join('; ')}.</p></div>
                )}
              </div>
            </div>

            <section aria-labelledby="whatif-h" className="mt-10">
              <h2 id="whatif-h" className="type-wide flex items-center gap-2 text-2xl font-extrabold"><FlaskConical size={22} className="text-[#A78BFA]" aria-hidden="true" /> What if…</h2>
              <p className="mt-1 max-w-prose text-sm text-ink-600">Pick a scenario or write your own. It runs on a copy of this twin with only the agents it affects.</p>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Scenarios">
                <button type="button" disabled={busy} className="chip border-[#A78BFA]/50 bg-[#A78BFA]/10 text-ink hover:border-[#A78BFA]"
                  onClick={() => { setWhatIf(DEMO_SCENARIO); simulate({ text: DEMO_SCENARIO }, DEMO_SCENARIO); }}>
                  Khunjerab route unavailable on day 4
                </button>
                {presets.map((p) => (
                  <button key={p.example} type="button" disabled={busy} className="chip border-white/15 bg-white/[0.03] text-ink-700 hover:border-white/40"
                    onClick={() => { setWhatIf(p.example); simulate({ text: p.example }, p.label); }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (whatIf.trim()) simulate({ text: whatIf }, whatIf); }}>
                <label htmlFor="whatif" className="sr-only">Your scenario</label>
                <input id="whatif" value={whatIf} onChange={(e) => setWhatIf(e.target.value)} maxLength={300}
                  placeholder="What if the Skardu road is blocked from day 2?"
                  className="min-h-[44px] flex-1 rounded-md border border-white/15 bg-black/30 px-3 text-ink placeholder:text-ink-500 focus:border-[#A78BFA] focus:outline-none" />
                <button type="submit" className="btn bg-[#A78BFA] text-[#120B24] hover:bg-[#C4B5FD]" disabled={busy || !whatIf.trim()}>Simulate</button>
              </form>

              {(sim.status === 'running' || sim.tasks.length > 0) && (
                <div className="m-card mt-5 p-4">
                  <p className="m-label">{sim.status === 'running' ? 'Simulating with the affected agents…' : 'Agents used for this scenario'}</p>
                  <div className="mt-2"><AgentFlow tasks={sim.tasks} compact /></div>
                  {sim.run && <Link to={`/agents?run=${sim.run.id}`} className="mt-2 inline-block text-sm font-semibold text-[#4CC9F0] hover:underline">Open in Agent Control Center</Link>}
                </div>
              )}
              {sim.error && <p className="mt-4 rounded-md border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{sim.error.message}</p>}
              {simResult && !simResult.ok && <p className="mt-4 rounded-md border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{simResult.error}</p>}
              {simResult?.no_alternative && (
                <div className="m-card mt-5 border-[#FF6B5B]/40 p-4" role="status">
                  <p className="m-label text-[#FF8A75]">{simResult.scenario.label}</p>
                  <p className="mt-1">{simResult.message}</p>
                </div>
              )}
              {simResult?.ok && !simResult.no_alternative && (
                <div className="mt-5"><Compare sim={simResult} busy={busy} onAccept={() => decide('accepted')} onReject={() => decide('kept original')} /></div>
              )}

              {history.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold">Scenario history</h3>
                    <button type="button" className="btn-quiet text-ink-600" onClick={() => { setHistory([]); write(`${KEY}:history`, null); }}>
                      <RotateCcw size={14} aria-hidden="true" /> Clear
                    </button>
                  </div>
                  <ul className="mt-2 flex flex-col divide-y divide-white/10 text-sm">
                    {history.map((h, i) => (
                      <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{h.label}</span>
                        <span className="text-ink-500">{h.decision} · {new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </section>
        )}

        {!twin && plan.status === 'idle' && (
          <p className="mt-8 text-sm text-ink-500">No twin yet. Describe a trip above, run the demo, or open one from the planner.</p>
        )}
      </div>
    </main>
  );
}
