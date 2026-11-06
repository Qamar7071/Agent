import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Phone, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { destinations, seasonalRoutes } from '../../lib/data.js';
import { checkedAt, monthSpan } from '../../lib/format.js';
import Forecast from '../shared/Forecast.jsx';
import NoForecast from '../shared/NoForecast.jsx';
import DataBadge from '../ui/DataBadge.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

const NHMP = 'https://beta.nhmp.gov.pk/ta/Public/ViewTravel.aspx';

function useLive(load, deps) {
  const [state, setState] = useState({ status: 'loading' });
  const run = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await load() });
    } catch (e) {
      setState({ status: 'error', error: e.message });
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    run();
  }, [run]);
  return [state, run];
}

const Loading = ({ label }) => (
  <div className="flex flex-col gap-2" role="status">
    <span className="sr-only">{label}</span>
    {[0, 1, 2].map((i) => <span key={i} className="skeleton h-10" aria-hidden="true" />)}
  </div>
);

export default function LiveConditions() {
  const [place, setPlace] = useState('hunza');
  const [weather, reloadWeather] = useLive(() => api.weather(place), [place]);
  const [alerts, reloadAlerts] = useLive(() => api.alerts(), []);
  const active = alerts.data?.alerts?.filter((a) => a.active) || [];
  const live = weather.status === 'ready' && weather.data?.available;

  return (
    <section id="conditions" aria-labelledby="cond-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="cond-title" eyebrow="Weather and roads, honestly" title="What we know, checked live. What we don’t, said plainly.">
            Forecasts and official alerts are fetched live and shown with the time they were checked. Road status is
            different: there is no official live feed Raahi can read, so it says so instead of guessing.
          </SectionHeader>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Reveal className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="type-semiwide flex items-center gap-2 text-xl font-bold">Forecast {live && <DataBadge kind="live" />}</h3>
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium">Place</span>
                <select value={place} onChange={(e) => setPlace(e.target.value)} className="field min-h-[40px] w-auto py-1.5 text-sm">
                  {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4" aria-live="polite">
              {weather.status === 'loading' && <Loading label="Checking the forecast…" />}
              {weather.status === 'error' && <NoForecast reason={`Couldn’t load the forecast: ${weather.error}`} onRetry={reloadWeather} />}
              {weather.status === 'ready' && !weather.data.available && <NoForecast reason={weather.data.reason} onRetry={reloadWeather} />}
              {live && <Forecast forecast={weather.data} />}
            </div>
          </Reveal>

          <div className="flex flex-col gap-6">
            <Reveal delay={80} className="card p-5 sm:p-6">
              <h3 className="type-semiwide flex items-center gap-2 text-xl font-bold">Official alerts <DataBadge kind="official" /></h3>
              <div className="mt-3 text-sm" aria-live="polite">
                {alerts.status === 'loading' && <Loading label="Checking the PMD alert feed…" />}
                {(alerts.status === 'error' || (alerts.status === 'ready' && !alerts.data.available)) && (
                  <div className="text-ink-700">
                    <p>Couldn’t check PMD alerts: {alerts.status === 'error' ? alerts.error : alerts.data.reason}</p>
                    <button type="button" onClick={reloadAlerts} className="btn-outline mt-3 min-h-[40px]"><RefreshCw size={15} aria-hidden="true" /> Try again</button>
                  </div>
                )}
                {alerts.status === 'ready' && alerts.data.available && (
                  <div className="flex flex-col gap-3">
                    {active.length ? active.map((a) => (
                      <div key={a.link} className="rounded-xl border border-ochre/40 bg-ochre-50 p-3">
                        <p className="font-semibold">{a.title}</p>
                        <p className="mt-1 text-ink-700">{a.region_excerpt}</p>
                        <p className="mt-1 text-xs text-ink-600">{a.severity} severity. Until {checkedAt(a.expires)}.</p>
                      </div>
                    )) : (
                      <p className="text-ink-700">No active Pakistan Meteorological Department alert mentions Gilgit-Baltistan or the KKH right now.</p>
                    )}
                    <p className="text-xs text-ink-600">
                      PMD alert feed, checked {checkedAt(alerts.data.retrieved_at)}
                      {alerts.data.feed_updated && `; feed last updated ${checkedAt(alerts.data.feed_updated)}`}. Weather alerts only, not road status.
                    </p>
                  </div>
                )}
              </div>
            </Reveal>

            <Reveal delay={140} className="card p-5 sm:p-6">
              <h3 className="type-semiwide flex items-center gap-2 text-xl font-bold">Roads <DataBadge kind="unverified" label="No live feed" /></h3>
              <p className="mt-3 text-sm text-ink-700">
                Raahi can’t see live road status, so it never says a road is open. No report of a closure doesn’t mean a road
                is clear. Check the morning you travel:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={NHMP} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-[40px]">
                  NHMP travel advisory <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                </a>
                <a href="tel:130" className="btn-outline min-h-[40px]"><Phone size={14} aria-hidden="true" /> Call 130</a>
              </div>
              <p className="mt-5 flex items-center gap-2 text-sm font-semibold">Usually open <DataBadge kind="typical" /></p>
              <ul className="mt-2 flex flex-col text-sm text-ink-700">
                {seasonalRoutes.map((r) => (
                  <li key={r.id} className="flex justify-between gap-4 border-b border-limestone-300 py-2 last:border-b-0">
                    <span>{r.name}</span>
                    <span className="num shrink-0 font-semibold text-ink">{monthSpan(r.typical_open_months)}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
