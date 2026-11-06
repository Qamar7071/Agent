// One destination, as a small travel encyclopedia entry. Facts come from Raahi's reviewed guide;
// the typical trip and the journey there from the real planner; packing from the Packing agent
// (on demand); the forecast live from Open-Meteo, with the typical pattern when there is none.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Backpack, CalendarDays, Car, ChevronDown, Clock, ExternalLink, Footprints, MapPin, Mountain, Phone, Plane, Route,
  Sparkles, Sun, Umbrella,
} from 'lucide-react';
import HeartButton from '../components/shared/HeartButton.jsx';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useAgentRun } from '../lib/agentRun.js';
import { byId, seasonalRouteFor, stays } from '../lib/data.js';
import { MONTHS, metres, monthSpan, pkr, pkrRange, plural } from '../lib/format.js';
import { CATEGORY_LABELS } from '../lib/discover.js';
import { outboundOf, shapeOf, typicalDays } from '../lib/tripFacts.js';
import { usePageMeta } from '../lib/seo.js';
import { creditLine, photos } from '../data/photos.js';
import Photo from '../components/ui/Photo.jsx';
import MonthStrip from '../components/ui/MonthStrip.jsx';
import DataBadge from '../components/ui/DataBadge.jsx';
import Forecast from '../components/shared/Forecast.jsx';
import NoForecast from '../components/shared/NoForecast.jsx';
import { closedMonths } from '../components/home/DestinationIndex.jsx';
import NotFound from './NotFound.jsx';

const NHMP = 'https://beta.nhmp.gov.pk/ta/Public/ViewTravel.aspx';
const PRIORITY = { essential: 'Essential', recommended: 'Recommended', optional: 'Optional' };

function LiveForecast({ id }) {
  const [state, setState] = useState({ status: 'loading' });
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await api.weather(id) });
    } catch (e) {
      setState({ status: 'error', error: e.message });
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div aria-live="polite">
      {state.status === 'loading' && <p className="text-sm text-ink-600" role="status">Checking the forecast…</p>}
      {state.status === 'error' && <NoForecast reason={`Couldn’t load the forecast: ${state.error}`} onRetry={load} />}
      {state.status === 'ready' && !state.data.available && <NoForecast reason={state.data.reason} onRetry={load} note={state.data.seasonal_note || null} />}
      {state.status === 'ready' && state.data.available && <Forecast forecast={state.data} days={7} />}
    </div>
  );
}

/** A typical first trip from Islamabad, built by the real planner (two people, by road, mid-range stays). */
function useTypicalTrip(d) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    if (!d) return undefined;
    let off = false;
    setState({ status: 'loading' });
    api.plan({ origin: 'Islamabad', destinations: [d.id], days: typicalDays(d), adults: 2, transport: 'car', accommodation: 'mid' })
      .then((res) => !off && setState({ status: 'ready', plan: res.itinerary }))
      .catch((e) => !off && setState({ status: 'error', error: e.message }));
    return () => { off = true; };
  }, [d]);
  return state;
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="glass min-w-0 rounded-2xl px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/75"><Icon size={14} aria-hidden="true" /> {label}</p>
      <p className="num mt-1 text-lg font-bold leading-tight text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-white/75">{sub}</p>}
    </div>
  );
}

function TypicalTrip({ d, trip }) {
  if (trip.status === 'loading') return <div className="skeleton h-40" aria-hidden="true" />;
  if (trip.status === 'error') return <p className="text-sm text-ink-600">The planner couldn’t estimate a typical trip just now. The planner below can still build one.</p>;
  const p = trip.plan;
  const shape = shapeOf(p);
  return (
    <div>
      <p className="num text-3xl font-extrabold leading-none">{pkr(p.budget.total)}</p>
      <p className="mt-1 text-sm text-ink-600">for 2 people, about <span className="num">{pkr(p.budget.per_person)}</span> each</p>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-700">
        <li>{plural(shape.total, 'day')} from Islamabad: {shape.travel} mainly travel, {shape.there} at {d.name.split(' ')[0]} and around</li>
        <li>Hired car with a driver, mid-range stays</li>
      </ul>
      <p className="mt-3"><DataBadge kind="estimate" label="Planner estimate" /></p>
      <p className="mt-2 text-xs text-ink-500">Built just now by Raahi’s planner from its cost assumptions. Not a quote; change anything in the planner.</p>
    </div>
  );
}

function Journey({ d, trip }) {
  const o = trip.status === 'ready' ? outboundOf(trip.plan) : null;
  return (
    <div className="flex flex-col gap-4">
      {o ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-3"><p className="text-xs font-semibold text-ink-600">From Islamabad</p><p className="num mt-0.5 font-bold">about {o.km.toLocaleString('en-US')} km</p></div>
          <div className="card p-3"><p className="text-xs font-semibold text-ink-600">Time on the move</p><p className="num mt-0.5 font-bold">{o.hours[0]}–{o.hours[1]} h</p></div>
          <div className="card p-3"><p className="text-xs font-semibold text-ink-600">Best split over</p><p className="num mt-0.5 font-bold">{plural(o.days, 'day')}</p></div>
        </div>
      ) : trip.status === 'loading' ? <div className="skeleton h-20" aria-hidden="true" /> : null}
      {o && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
          {o.modes.includes('flight') ? <Plane size={16} aria-hidden="true" /> : <Car size={16} aria-hidden="true" />}
          By {o.modes.map((m) => ({ drive: 'road', jeep: 'jeep track', flight: 'air', trek: 'trek' }[m] || m)).join(' and ')}
          {o.via.length > 0 && <> via {o.via.join(', ')}</>}. <DataBadge kind="curated" label="Curated drive times" />
        </p>
      )}
      <p className="max-w-prose text-ink-700">{d.access}</p>
      <p className="text-xs text-ink-500">Mountain drives take longer than map estimates. Drive in daylight and check road status on the morning you travel.</p>
    </div>
  );
}

function Packing({ d }) {
  const run = useAgentRun();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [list, setList] = useState(null);
  const ask = useCallback((m) => {
    setList(null);
    run.start(api.runAgents, { request: { origin: 'Islamabad', destinations: [d.id], days: typicalDays(d), adults: 2, travel_month: m }, intent: 'packing' },
      `Packing: ${d.name}, ${MONTHS[m - 1]}`).then((res) => res && setList(res.agents?.packing || null));
  }, [d, run]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !list && run.status !== 'running') ask(month);
  };
  const groups = list ? ['essential', 'recommended', 'optional'].map((p) => [p, list.items.filter((i) => i.priority === p)]).filter(([, i]) => i.length) : [];
  return (
    <section aria-labelledby="pack-h" className="card overflow-hidden">
      <h2 id="pack-h" className="m-0">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="pack-panel"
          className="flex w-full items-center gap-3 p-5 text-left hover:bg-limestone/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-juniper-50 text-juniper-700" aria-hidden="true"><Backpack size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="type-semiwide block text-xl font-bold">What to pack</span>
            <span className="block text-sm font-normal text-ink-600">Built by the Packing agent for {d.name} and the month you choose.</span>
          </span>
          <ChevronDown size={20} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div id="pack-panel" className="border-t border-limestone-300 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="pack-month" className="text-sm font-semibold">Travelling in</label>
            <select id="pack-month" className="field min-h-[40px] w-auto py-1 text-sm" value={month}
              onChange={(e) => { const m = Number(e.target.value); setMonth(m); ask(m); }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          {run.status === 'running' && <p className="mt-4 text-sm text-ink-600" role="status">The packing and weather agents are working…</p>}
          {run.error && <p className="mt-4 text-sm text-brick" role="alert">{run.error.message} <button type="button" className="link" onClick={() => ask(month)}>Try again</button></p>}
          {list && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm text-ink-600">Based on {list.basis}.{run.run && <> <Link to={`/decided?run=${run.run.id}`} className="link">See how the agents decided</Link>.</>}</p>
              {groups.map(([p, items]) => (
                <div key={p}>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-ink-600">{PRIORITY[p]}</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {items.map((i) => (
                      <li key={i.name} className="rounded-xl border border-limestone-300 p-3">
                        <p className="font-semibold">{i.name} <span className="ml-1 text-xs font-normal text-ink-500">{i.category}</span></p>
                        <p className="mt-0.5 text-sm text-ink-600">{i.why}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Destination({ id }) {
  const d = byId[id];
  usePageMeta({
    title: d ? `${d.name}: travel guide` : 'Not found',
    description: d ? `${d.tagline}. Altitude about ${metres(d.altitude_m)}, usually best ${monthSpan(d.best_months)}. ${d.access}` : undefined,
    path: `/destinations/${id}`,
    noindex: !d,
  });
  const trip = useTypicalTrip(d);
  const month = new Date().getMonth() + 1;
  const kinds = useMemo(() => (d ? d.category.map((c) => CATEGORY_LABELS[c]).filter(Boolean) : []), [d]);
  if (!d) return <NotFound />;
  const stay = stays[id];
  const route = seasonalRouteFor(id);
  const closed = closedMonths(id);
  const days = d.recommended_days.min === d.recommended_days.max ? plural(d.recommended_days.min, 'day') : `${d.recommended_days.min}–${d.recommended_days.max} days`;
  const nowFit = closed.includes(month) ? 'closed' : d.best_months.includes(month) ? 'best' : 'possible';

  return (
    <main id="main">
      <div className="on-dark relative isolate mt-16 overflow-hidden bg-juniper-950 text-white">
        <div className="absolute inset-0 -z-20"><Photo id={id} priority sizes="100vw" /></div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-juniper-950 via-juniper-950/55 to-juniper-950/10" />
        <div className="mx-auto flex min-h-[62vh] max-w-page flex-col justify-end px-4 pb-8 pt-24 sm:px-6">
          <p className="text-sm text-white/85"><Link to="/#destinations" className="hover:underline">Destinations</Link> / {d.region.replace(' · ', ', ')}</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <h1 className="type-wide text-[clamp(2.2rem,5vw,3.75rem)] font-extrabold leading-[1.05]">{d.name}</h1>
            <HeartButton id={d.id} name={d.name} className="mt-2 shrink-0" />
          </div>
          <p className="mt-2 max-w-[56ch] text-lg text-white/90">{d.tagline}</p>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={Mountain} label="Altitude" value={`about ${metres(d.altitude_m)}`} sub={d.altitude_m >= 4000 ? 'Very high ground' : d.altitude_m >= 3000 ? 'High ground' : 'Valley level'} />
            <Stat icon={CalendarDays} label="Usually best" value={monthSpan(d.best_months)} sub={route ? `Access typically ${monthSpan(route.typical_open_months)}` : 'Typical pattern'} />
            <Stat icon={Clock} label="Time to allow" value={days} sub="there, plus the road" />
            <Stat icon={MapPin} label="Kind of place" value={kinds[0] || '—'} sub={kinds.slice(1).join(', ') || d.province} />
          </div>
          <p className="mt-4 text-xs text-white/70">{photos[id]?.place}. {creditLine(id)}.</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-page gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="about-h">
            <p className="eyebrow">Overview</p>
            <h2 id="about-h" className="sr-only">About {d.name}</h2>
            <p className="mt-3 max-w-prose text-lg leading-relaxed text-ink-700">{d.description}</p>
            <div className="card mt-6 max-w-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">When to go</p>
                <DataBadge kind="typical" />
              </div>
              <div className="mt-3"><MonthStrip best={d.best_months} closed={closed} selected={month} /></div>
              <p className="mt-2 text-sm text-ink-600">{d.season_note}{route ? ` ${route.note}` : ''}</p>
              <p className={`mt-2 text-sm font-semibold ${nowFit === 'best' ? 'text-juniper-700' : nowFit === 'closed' ? 'text-brick' : 'text-ochre-700'}`}>
                {nowFit === 'best' && `${MONTHS[month - 1]} is usually a good month here.`}
                {nowFit === 'closed' && `In ${MONTHS[month - 1]}, access is usually closed by snow.`}
                {nowFit === 'possible' && `${MONTHS[month - 1]} is possible here, but outside the usual best months.`}
              </p>
            </div>
          </section>

          <section aria-labelledby="hl-h">
            <h2 id="hl-h" className="type-semiwide text-2xl font-bold">What to see and do</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {d.highlights.map((h, i) => (
                <li key={h} className="card flex items-center gap-3 p-4">
                  <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-apricot-100 text-sm font-bold text-ochre-700" aria-hidden="true">{i + 1}</span>
                  <span className="font-medium">{h}</span>
                </li>
              ))}
            </ul>
          </section>

          {d.day_plans?.length > 0 && (
            <section aria-labelledby="days-h">
              <h2 id="days-h" className="type-semiwide text-2xl font-bold">Ideas for your days here</h2>
              <p className="mt-1 text-sm text-ink-600">The plans Raahi’s planner draws on for {d.name}. Ask it to change any of them.</p>
              <ol className="mt-4 grid gap-3 md:grid-cols-3">
                {d.day_plans.map((p, i) => (
                  <li key={p.title} className="card p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-ochre-700">Idea {i + 1}</p>
                    <h3 className="mt-1 font-bold leading-snug">{p.title}</h3>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-sm text-ink-700 marker:text-juniper-500">
                      {p.activities.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="go-h">
            <h2 id="go-h" className="type-semiwide text-2xl font-bold">Getting there</h2>
            <div className="mt-4"><Journey d={d} trip={trip} /></div>
          </section>

          <section aria-labelledby="consider-h">
            <h2 id="consider-h" className="type-semiwide text-2xl font-bold">Before you go</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="card p-4">
                <p className="flex items-center gap-2 font-semibold"><Mountain size={18} className="text-ochre-700" aria-hidden="true" /> Altitude</p>
                <p className="mt-1 text-sm text-ink-700">About {metres(d.altitude_m)}. {d.altitude_note}</p>
                {d.altitude_m >= 3500 && (
                  <p className="mt-2 text-sm text-ink-700">
                    Above about 4,000 m, if anyone in your group is sensitive to altitude, Raahi’s planner adds a full day at
                    altitude first. Go slowly and drink water. This is planning guidance, not medical advice.
                  </p>
                )}
              </div>
              <div className="card p-4">
                <p className="flex items-center gap-2 font-semibold"><Footprints size={18} className="text-juniper-600" aria-hidden="true" /> Access and fitness</p>
                <p className="mt-1 text-sm text-ink-700">{d.accessibility}</p>
              </div>
              <div className="card p-4">
                <p className="flex items-center gap-2 font-semibold"><Umbrella size={18} className="text-lake" aria-hidden="true" /> If the weather turns</p>
                <p className="mt-1 text-sm text-ink-700">{d.bad_weather_alternative}</p>
              </div>
              <div className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold"><Route size={18} className="text-brick" aria-hidden="true" /> Roads</p>
                  <DataBadge kind="unverified" label="No live feed" />
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {route ? `${route.name}: typically open ${monthSpan(route.typical_open_months)} (a typical pattern, not live). ` : ''}
                  Current road status could not be verified: no public live feed exists for Gilgit-Baltistan.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={NHMP} target="_blank" rel="noopener noreferrer" className="btn-outline min-h-[40px] text-sm">NHMP advisory <ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
                  <a href="tel:130" className="btn-outline min-h-[40px] text-sm"><Phone size={13} aria-hidden="true" /> Call 130</a>
                </div>
              </div>
            </div>
          </section>

          <Packing d={d} />

          {stay && (
            <section aria-labelledby="stay-h">
              <h2 id="stay-h" className="type-semiwide text-2xl font-bold">Where to stay</h2>
              {stay.note && <p className="mt-2 text-ink-700">{stay.note}</p>}
              <ul className="mt-3 divide-y divide-limestone-300 overflow-hidden rounded-2xl border border-limestone-300 bg-paper text-sm">
                {stay.options.map((o) => (
                  <li key={o.name} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span><span className="font-medium">{o.name}</span> <span className="text-xs text-ink-500">{o.tier}</span></span>
                    <span className="num text-ink-700">{o.to ? `${pkrRange(o.from, o.to)} a night` : 'Arranged by your operator'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500"><DataBadge kind="estimate" label="Indicative prices" /> {stay.price_note}</p>
            </section>
          )}

          <section aria-labelledby="src-h">
            <h2 id="src-h" className="type-semiwide text-2xl font-bold">Sources</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {d.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">{s.label} <ExternalLink size={12} aria-hidden="true" /></a></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-500">{d.record_note} Last reviewed {d.last_reviewed}.</p>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow">A typical trip</p>
            <h2 className="type-semiwide mt-2 text-lg font-bold">{d.name} from Islamabad</h2>
            <div className="mt-3"><TypicalTrip d={d} trip={trip} /></div>
            <Link to={`/plan?d=${id}`} className="btn-primary mt-4 w-full"><Sparkles size={16} aria-hidden="true" /> Plan this trip</Link>
            <Link to={`/explore?days=${typicalDays(d)}&people=2`} className="btn-quiet mt-1 w-full text-sm">Compare with other places</Link>
          </div>
          <div className="card p-5">
            <h2 className="type-semiwide flex items-center gap-2 text-lg font-bold"><Sun size={18} className="text-apricot" aria-hidden="true" /> Forecast</h2>
            <div className="mt-2"><LiveForecast id={id} /></div>
          </div>
          {d.nearby?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink-600">Nearby</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {d.nearby.filter((n) => byId[n]).map((n) => (
                  <li key={n}>
                    <Link to={`/destinations/${n}`} className="chip py-1 pl-1">
                      <img src={`/images/${n}-thumb.webp`} alt="" width="28" height="28" loading="lazy" className="h-7 w-7 rounded-full object-cover" />
                      {byId[n].name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
