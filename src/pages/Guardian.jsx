import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, RefreshCw, ShieldCheck } from 'lucide-react';
import { usePageMeta } from '../lib/seo.js';
import { api } from '../lib/api.js';
import { useAgentRun } from '../lib/agentRun.js';
import { Link, useRouter } from '../lib/router.jsx';
import { read, savedTrips, write } from '../lib/store.js';
import { usePlanner } from '../context/PlannerContext.jsx';
import { checkedAt } from '../lib/format.js';
import AgentFlow from '../components/mission/AgentFlow.jsx';

const COLOR = { Low: '#3DDC97', Moderate: '#F5B841', High: '#FF6B5B', Severe: '#FF3D6E' };
const FACTOR = {
  forecast_severe: 'Severe weather in the forecast', official_alert: 'Official PMD alert', seasonal_closure: 'Usually closed this month',
  scenario_hazard: 'Travel Twin scenario', monsoon_landslide: 'Monsoon landslides', winter_conditions: 'Winter conditions',
  long_drive: 'Long mountain drive', after_dark: 'Arrival after dark', high_altitude: 'High altitude', community_reports: 'Community reports',
};
const KIND = { live: 'Live', official: 'Official', typical: 'Typical pattern', plan: 'From the plan', scenario: 'Scenario', community: 'Community' };
const AUTO_MIN = 30;

const keyFor = (req) => `raahi:guardian:${[req.origin, ...(req.destinations || []), req.start_date || req.travel_month, req.days].join('|')}`;

function Gauge({ score, category }) {
  const a = Math.PI * (1 - Math.min(100, score) / 100);
  const x = 100 + 80 * Math.cos(a);
  const y = 100 - 80 * Math.sin(a);
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[220px]" role="img" aria-label={`Risk ${score} out of 100, ${category}`}>
      <path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M20,100 A80,80 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`} fill="none" stroke={COLOR[category]} strokeWidth="14" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${COLOR[category]}88)` }} />
      <text x="100" y="88" textAnchor="middle" fontSize="30" fontWeight="800" fill="#E6EDF0">{score}</text>
      <text x="100" y="108" textAnchor="middle" fontSize="12" fill="#A7B4BB">of 100 · {category}</text>
    </svg>
  );
}

export default function Guardian() {
  usePageMeta({
    title: 'Journey Guardian',
    description: 'Re-check a planned trip against live forecasts, official alerts and seasonal patterns, with a transparent risk score and what changed since the last check.',
    path: '/guardian',
  });
  const { itinerary } = usePlanner();
  const { query } = useRouter();
  const run = useAgentRun();
  const twin = read('raahi:twin:v1', null)?.twin;
  const sources = useMemo(() => {
    const out = [];
    if (twin) out.push({ id: 'twin', label: `Travel Twin: ${twin.summary.title}`, request: twin.request });
    if (itinerary) out.push({ id: 'plan', label: `Current plan: ${itinerary.title}`, request: itinerary.request });
    savedTrips().forEach((t) => out.push({ id: `trip:${t.id}`, label: `Saved trip: ${t.title}`, trip: t }));
    return out;
  }, [twin, itinerary]);
  const [sourceId, setSourceId] = useState(() => (query.get('from') === 'twin' ? 'twin' : null));
  const [result, setResult] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notify, setNotify] = useState(() => read('raahi:guardian:notify', false));
  const [nextAt, setNextAt] = useState(null);
  const source = sources.find((s) => s.id === sourceId) || sources[0];

  const check = useCallback(async () => {
    if (!source) return;
    setLoadError(null);
    let request = source.request;
    if (source.trip) {
      try {
        request = (await api.getTrip(source.trip.id, source.trip.token)).trip.request;
      } catch (e) {
        setLoadError(e.message);
        return;
      }
    }
    const key = keyFor(request);
    const previous = read(key, null);
    const res = await run.start(api.guardian, { request, previous }, `Guardian: ${source.label}`);
    if (res?.ok) {
      setResult(res);
      const a = res.assessment;
      write(key, { overall: a.overall, days: a.days.map((d) => ({ day: d.day, score: d.score, category: d.category, title: d.title })),
        alert_titles: a.alert_titles, checked_at: res.checked_at });
      setNextAt(new Date(Date.now() + AUTO_MIN * 60000));
      if (notify && res.changes.some((c) => c.severity === 'high') && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Raahi Guardian', { body: res.changes[0].message }); } catch { /* not supported */ }
      }
    }
  }, [source, run, notify]);

  useEffect(() => {
    if (source) check();
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nextAt) return undefined;
    const t = setTimeout(check, Math.max(1000, nextAt.getTime() - Date.now()));
    return () => clearTimeout(t);
  }, [nextAt, check]);

  const toggleNotify = async () => {
    if (!notify && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return;
    }
    setNotify(!notify);
    write('raahi:guardian:notify', !notify);
  };

  const a = result?.assessment;
  return (
    <main id="main" className="mission min-h-screen pb-20 pt-16">
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6">
        <p className="m-label text-[#3DDC97]">Predictive Journey Guardian</p>
        <h1 className="type-wide mt-2 text-3xl font-extrabold sm:text-5xl">Is the trip still a good idea?</h1>
        <p className="mt-3 max-w-prose text-ink-600">
          The Guardian re-runs the weather, route and safety agents on your trip and scores each day from documented factors.
          It is a heuristic from public data, not an official safety assessment, and it never says a road is open.
        </p>

        {!sources.length ? (
          <div className="m-card mt-8 p-5">
            <p>There’s no trip to watch yet.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/twin?demo=1" className="btn bg-[#4CC9F0] text-[#04121A]">Build the demo trip</Link>
              <Link to="/plan" className="btn border border-white/15 text-ink hover:bg-white/5">Plan a trip</Link>
            </div>
          </div>
        ) : (
          <div className="m-card mt-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="g-src" className="m-label">Trip to check</label>
              <select id="g-src" value={source?.id} onChange={(e) => { setSourceId(e.target.value); setResult(null); }}
                className="mt-1 block min-h-[44px] w-full rounded-md border border-white/15 bg-black/40 px-3 text-ink">
                {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <button type="button" className="btn bg-[#3DDC97] text-[#06140F] hover:bg-[#6BE7B2]" onClick={check} disabled={run.status === 'running'}>
              <RefreshCw size={16} className={run.status === 'running' ? 'animate-spin' : ''} aria-hidden="true" /> {run.status === 'running' ? 'Checking…' : 'Check now'}
            </button>
            <button type="button" className="btn border border-white/15 text-ink hover:bg-white/5" onClick={toggleNotify} aria-pressed={notify}>
              <Bell size={16} aria-hidden="true" /> {notify ? 'Browser alerts on' : 'Alert me in this browser'}
            </button>
          </div>
        )}
        {loadError && <p className="mt-3 rounded-md border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{loadError}</p>}
        {run.error && <p className="mt-3 rounded-md border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3 text-sm" role="alert">{run.error.message}</p>}
        {run.status === 'running' && (
          <div className="m-card mt-6 p-4"><p className="m-label" role="status">Agents checking your trip…</p><div className="mt-2"><AgentFlow tasks={run.tasks} compact /></div></div>
        )}

        {a && (
          <div className="mt-8 flex flex-col gap-6">
            <section aria-labelledby="g-overall" className="m-card grid gap-6 p-5 md:grid-cols-[240px_1fr]">
              <div className="flex flex-col items-center">
                <Gauge score={a.overall.score} category={a.overall.category} />
                <p className="mt-1 text-center text-sm font-semibold" style={{ color: COLOR[a.overall.category] }}>Recommendation: {result.decision}</p>
              </div>
              <div>
                <h2 id="g-overall" className="type-semiwide text-xl font-bold">{result.plan_title}</h2>
                <p className="mt-1 text-sm">{a.overall.action}</p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ink-500">Confidence</dt><dd>{a.confidence}: {a.confidence_reason}</dd>
                  <dt className="text-ink-500">Checked</dt><dd className="num">{checkedAt(result.checked_at)}{nextAt && ` · next check ${nextAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} while this page is open`}</dd>
                  <dt className="text-ink-500">Road status</dt><dd>{a.road_status?.headline} {a.road_status?.rule}</dd>
                  <dt className="text-ink-500">Model</dt><dd>Risk model {a.model_version}. {a.disclaimer}</dd>
                </dl>
                {run.run && (
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                    <Link to={`/decided?run=${run.run.id}`} className="text-[#4CC9F0] hover:underline">How the agents decided</Link>
                    <Link to={`/agents?run=${run.run.id}`} className="text-[#4CC9F0] hover:underline">Open in Agent Control Center</Link>
                  </p>
                )}
                {a.road_status?.official_checks?.length > 0 && (
                  <p className="mt-3 text-sm">
                    <ShieldCheck size={15} className="mr-1 inline text-[#3DDC97]" aria-hidden="true" />
                    Check before you drive: {a.road_status.official_checks.map((c, i) => (
                      <span key={c.url}>{i > 0 && ', '}<a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[#4CC9F0] underline">{c.name}</a>{c.phone && ` (${c.phone})`}</span>
                    ))}
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="g-changes" className="m-card p-5">
              <h2 id="g-changes" className="font-semibold">Since your last check</h2>
              {result.changes.length ? (
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {result.changes.map((c, i) => (
                    <li key={i} className="flex gap-2"><span style={{ color: c.severity === 'high' ? '#FF6B5B' : '#4CC9F0' }}>●</span>{c.message}</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-sm text-ink-500">No changes, or this is the first check of this trip in this browser.</p>}
            </section>

            <section aria-labelledby="g-days">
              <h2 id="g-days" className="type-semiwide text-xl font-bold">Day by day</h2>
              <ol className="mt-3 grid gap-4 md:grid-cols-2">
                {a.days.map((d) => (
                  <li key={d.day} className="m-card p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold">Day {d.day}: {d.title}</h3>
                      <span className="num shrink-0 text-sm font-bold" style={{ color: COLOR[d.category] }}>{d.category} · {d.score}</span>
                    </div>
                    {d.date && <p className="text-xs text-ink-500">{d.date}</p>}
                    <div className="mt-2 h-1.5 rounded-full bg-white/5" aria-hidden="true">
                      <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: COLOR[d.category] }} />
                    </div>
                    {d.factors.length ? (
                      <ul className="mt-3 flex flex-col gap-2 text-sm">
                        {d.factors.map((f) => (
                          <li key={f.factor}>
                            <span className="font-medium">{FACTOR[f.factor] || f.factor}</span>
                            <span className="num ml-2 text-xs text-ink-500">+{f.points} ({f.weight} × {f.intensity})</span>
                            <span className="ml-2 rounded border border-white/15 px-1.5 text-[10px] uppercase tracking-wider text-ink-600">{KIND[f.kind] || f.kind}</span>
                            <span className="block text-xs text-ink-600">{f.evidence} Source: {f.source}.</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-sm text-ink-500">No risk factors found for this day.</p>}
                    <p className="mt-3 text-sm"><span className="m-label mr-1">Action</span>{d.action}</p>
                    {d.alternative && <p className="mt-1 text-sm text-ink-700"><span className="m-label mr-1">Alternative</span>{d.alternative}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="g-weights" className="m-card p-5">
              <h2 id="g-weights" className="font-semibold">How the score works</h2>
              <p className="mt-1 text-sm text-ink-600">Each factor adds weight × intensity (0 to 1) from its evidence; a day’s score is capped at 100.
                Low under 20, Moderate 20–39, High 40–59, Severe 60 and above. Weights are set in Raahi’s data file and can be changed without changing code.</p>
              <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(a.weights).map(([k, w]) => (
                  <li key={k} className="flex justify-between gap-3 border-b border-white/5 py-1"><span>{FACTOR[k] || k}</span><span className="num text-ink-600">{w}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-500">Not included: {a.not_included.join('; ')}.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
