import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Phone, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { destinations, seasonalRoutes } from '../../lib/data.js';
import { checkedAt, monthSpan } from '../../lib/format.js';
import Forecast from '../shared/Forecast.jsx';

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

function Failed({ message, onRetry }) {
  return (
    <div className="text-sm text-white/80">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="btn mt-3 min-h-[40px] border border-white/40 text-white hover:bg-white/10">
        <RefreshCw size={15} aria-hidden="true" /> Try again
      </button>
    </div>
  );
}

const Loading = ({ label }) => (
  <p className="flex items-center gap-2 text-sm text-white/75" role="status">
    <span className="h-2 w-2 animate-pulseDot rounded-full bg-apricot" aria-hidden="true" /> {label}
  </p>
);

export default function LiveConditions() {
  const [place, setPlace] = useState('hunza');
  const [weather, reloadWeather] = useLive(() => api.weather(place), [place]);
  const [alerts, reloadAlerts] = useLive(() => api.alerts(), []);
  const active = alerts.data?.alerts?.filter((a) => a.active) || [];

  return (
    <section id="conditions" aria-labelledby="cond-title" className="on-dark bg-juniper py-16 text-white sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <h2 id="cond-title" className="type-wide text-3xl font-extrabold sm:text-4xl">Weather and roads, honestly</h2>
        <p className="mt-3 max-w-prose text-white/85">
          Forecasts and official alerts are fetched live and shown with the time they were checked. Road status is
          different: there is no official live feed Raahi can read, so it says so instead of guessing.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="type-semiwide text-xl font-bold">Forecast</h3>
              <label className="flex items-center gap-2 text-sm">
                <span>Place</span>
                <select value={place} onChange={(e) => setPlace(e.target.value)} className="field min-h-[40px] w-auto py-1.5 text-sm">
                  {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4" aria-live="polite">
              {weather.status === 'loading' && <Loading label="Checking the forecast…" />}
              {weather.status === 'error' && <Failed message={`Couldn’t load the forecast: ${weather.error}`} onRetry={reloadWeather} />}
              {weather.status === 'ready' && <Forecast forecast={weather.data} dark />}
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div>
              <h3 className="type-semiwide text-xl font-bold">Official alerts</h3>
              <div className="mt-3 text-sm" aria-live="polite">
                {alerts.status === 'loading' && <Loading label="Checking the PMD alert feed…" />}
                {alerts.status === 'error' && <Failed message={`Couldn’t check PMD alerts: ${alerts.error}`} onRetry={reloadAlerts} />}
                {alerts.status === 'ready' && !alerts.data.available && (
                  <Failed message={`Couldn’t check PMD alerts: ${alerts.data.reason}`} onRetry={reloadAlerts} />
                )}
                {alerts.status === 'ready' && alerts.data.available && (
                  <div className="flex flex-col gap-3">
                    {active.length ? active.map((a) => (
                      <div key={a.link} className="rounded border border-apricot/50 bg-white/5 p-3">
                        <p className="font-semibold">{a.title}</p>
                        <p className="mt-1 text-white/80">{a.region_excerpt}</p>
                        <p className="mt-1 text-xs text-white/70">{a.severity} severity. Until {checkedAt(a.expires)}.</p>
                      </div>
                    )) : (
                      <p className="text-white/85">No active Pakistan Meteorological Department alert mentions Gilgit-Baltistan or the KKH right now.</p>
                    )}
                    <p className="text-xs text-white/70">
                      PMD alert feed, checked {checkedAt(alerts.data.retrieved_at)}
                      {alerts.data.feed_updated && `; feed last updated ${checkedAt(alerts.data.feed_updated)}`}. Weather alerts only, not road status.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="type-semiwide text-xl font-bold">Roads</h3>
              <p className="mt-3 text-sm text-white/85">
                Raahi can’t see live road status, so it never says a road is open. No report of a closure doesn’t mean a
                road is clear. Check the morning you travel:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={NHMP} target="_blank" rel="noopener noreferrer" className="btn-light min-h-[40px]">
                  NHMP travel advisory <ExternalLink size={14} aria-hidden="true" />
                </a>
                <a href="tel:130" className="btn min-h-[40px] border border-white/40 text-white hover:bg-white/10">
                  <Phone size={14} aria-hidden="true" /> Call 130
                </a>
              </div>
              <p className="mt-5 text-sm font-semibold">Usually open (typical seasons, not live)</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-white/85">
                {seasonalRoutes.map((r) => (
                  <li key={r.id} className="flex justify-between gap-4 border-b border-white/10 pb-1.5">
                    <span>{r.name}</span>
                    <span className="num shrink-0 text-white">{monthSpan(r.typical_open_months)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
