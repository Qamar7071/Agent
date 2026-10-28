import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { byId, seasonalRouteFor, stays } from '../lib/data.js';
import { metres, monthSpan, pkr } from '../lib/format.js';
import { usePageMeta } from '../lib/seo.js';
import { creditLine, photos } from '../data/photos.js';
import Photo from '../components/ui/Photo.jsx';
import MonthStrip from '../components/ui/MonthStrip.jsx';
import Forecast from '../components/shared/Forecast.jsx';
import { closedMonths } from '../components/home/DestinationIndex.jsx';
import NotFound from './NotFound.jsx';

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
      {state.status === 'error' && (
        <div className="text-sm text-ink-700">
          <p>Couldn’t load the forecast: {state.error}</p>
          <button type="button" onClick={load} className="btn-outline mt-2 min-h-[38px]"><RefreshCw size={14} aria-hidden="true" /> Try again</button>
        </div>
      )}
      {state.status === 'ready' && <Forecast forecast={state.data} days={7} />}
    </div>
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
  if (!d) return <NotFound />;
  const stay = stays[id];
  const route = seasonalRouteFor(id);

  return (
    <main id="main">
      <div className="on-dark relative isolate mt-16 bg-juniper-950 text-white">
        <div className="absolute inset-0 -z-10 opacity-80">
          <Photo id={id} priority sizes="100vw" />
        </div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-juniper-950 via-juniper-950/50 to-juniper-950/10" />
        <div className="mx-auto flex min-h-[46vh] max-w-page flex-col justify-end px-4 pb-8 pt-24 sm:px-6">
          <p className="text-sm text-white/85"><Link to="/#destinations" className="hover:underline">Destinations</Link> / {d.region.replace(' · ', ', ')}</p>
          <h1 className="type-wide mt-2 text-[clamp(2.2rem,5vw,3.75rem)] font-extrabold leading-[1.05]">{d.name}</h1>
          <p className="mt-2 max-w-[56ch] text-lg text-white/90">{d.tagline}</p>
          <p className="mt-4 text-xs text-white/70">{photos[id]?.place}. {creditLine(id)}.</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-page gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="about-h">
            <h2 id="about-h" className="sr-only">About {d.name}</h2>
            <p className="max-w-prose text-lg leading-relaxed text-ink-700">{d.description}</p>
            <dl className="mt-6 grid max-w-prose grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-600">Altitude</dt><dd className="num text-base font-semibold">about {metres(d.altitude_m)}</dd></div>
              <div><dt className="text-ink-600">Time to allow</dt><dd className="num text-base font-semibold">{d.recommended_days.min === d.recommended_days.max ? `${d.recommended_days.min} day` : `${d.recommended_days.min}–${d.recommended_days.max} days`}</dd></div>
              <div><dt className="text-ink-600">Usually best</dt><dd className="text-base font-semibold">{monthSpan(d.best_months)}</dd></div>
            </dl>
            <div className="mt-6 max-w-md">
              <MonthStrip best={d.best_months} closed={closedMonths(id)} />
              <p className="mt-2 text-sm text-ink-600">{d.season_note}{route ? ` ${route.note}` : ''}</p>
            </div>
          </section>

          <section aria-labelledby="hl-h">
            <h2 id="hl-h" className="type-semiwide text-xl font-bold">What to see and do</h2>
            <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 marker:text-juniper-500">
              {d.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </section>

          <section aria-labelledby="go-h">
            <h2 id="go-h" className="type-semiwide text-xl font-bold">Getting there</h2>
            <p className="mt-2 max-w-prose text-ink-700">{d.access}</p>
            <h3 className="mt-5 font-semibold">Access and fitness</h3>
            <p className="mt-1 max-w-prose text-ink-700">{d.accessibility}</p>
            <h3 className="mt-5 font-semibold">If the weather turns</h3>
            <p className="mt-1 max-w-prose text-ink-700">{d.bad_weather_alternative}</p>
          </section>

          {stay && (
            <section aria-labelledby="stay-h">
              <h2 id="stay-h" className="type-semiwide text-xl font-bold">Where to stay</h2>
              {stay.note && <p className="mt-2 text-ink-700">{stay.note}</p>}
              <ul className="mt-3 divide-y divide-limestone-300 rounded border border-limestone-300 bg-paper text-sm">
                {stay.options.map((o) => (
                  <li key={o.name} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                    <span><span className="font-medium">{o.name}</span> <span className="text-xs text-ink-500">{o.tier}</span></span>
                    <span className="num text-ink-700">{o.to ? `${pkr(o.from)}–${o.to.toLocaleString('en-US')} a night` : 'Arranged by your operator'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">{stay.price_note}</p>
            </section>
          )}

          <section aria-labelledby="src-h">
            <h2 id="src-h" className="type-semiwide text-xl font-bold">Sources</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {d.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">{s.label} <ExternalLink size={12} aria-hidden="true" /></a></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-500">{d.record_note} Last reviewed {d.last_reviewed}.</p>
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-md border border-limestone-300 bg-paper p-5">
            <h2 className="type-semiwide text-lg font-bold">Plan a trip to {d.name}</h2>
            <p className="mt-1 text-sm text-ink-600">Raahi adds the drive days, overnight stops and costs from where you start.</p>
            <Link to={`/plan?d=${id}`} className="btn-primary mt-4 w-full">Plan this trip</Link>
          </div>
          <div className="rounded-md border border-limestone-300 bg-paper p-5">
            <h2 className="type-semiwide text-lg font-bold">Forecast</h2>
            <div className="mt-2"><LiveForecast id={id} /></div>
          </div>
          {d.nearby?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink-600">Nearby</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {d.nearby.filter((n) => byId[n]).map((n) => <li key={n}><Link to={`/destinations/${n}`} className="chip">{byId[n].name}</Link></li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
