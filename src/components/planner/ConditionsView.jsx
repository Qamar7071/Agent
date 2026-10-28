import { RefreshCw } from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { checkedAt } from '../../lib/format.js';
import Forecast from '../shared/Forecast.jsx';
import RoadStatus from '../shared/RoadStatus.jsx';
import Notice from '../ui/Notice.jsx';

export default function ConditionsView() {
  const { conditions, refreshConditions } = usePlanner();
  const data = conditions.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600" aria-live="polite">
          {conditions.status === 'loading' && 'Checking the forecast, official alerts and roads…'}
          {conditions.status === 'ready' && `Checked ${checkedAt(data.retrieved_at)}.`}
          {conditions.status === 'error' && 'The live check didn’t finish.'}
          {conditions.status === 'idle' && 'Not checked yet.'}
        </p>
        <button type="button" onClick={refreshConditions} disabled={conditions.status === 'loading'} className="btn-outline min-h-[38px]">
          <RefreshCw size={15} aria-hidden="true" className={conditions.status === 'loading' ? 'animate-spin' : ''} /> Check again
        </button>
      </div>

      {conditions.status === 'error' && <Notice level="warning" title="Couldn’t check live conditions">{conditions.error}</Notice>}

      {data && (
        <>
          {data.notes?.map((n) => <Notice key={n} level="info">{n}</Notice>)}
          {data.weather_flags?.length > 0 && (
            <Notice level="warning" title="Weather to plan around">
              <ul className="mt-1 flex flex-col gap-1">
                {data.weather_flags.map((f) => <li key={`${f.day}-${f.message}`}>Day {f.day}: {f.message}</li>)}
              </ul>
            </Notice>
          )}
          <section aria-labelledby="roads-h">
            <h3 id="roads-h" className="type-semiwide text-lg font-bold">Roads</h3>
            <div className="mt-3 rounded border border-limestone-300 bg-paper p-4">
              <RoadStatus status={data.roads} />
            </div>
          </section>
          <section aria-labelledby="wx-h">
            <h3 id="wx-h" className="type-semiwide text-lg font-bold">Forecasts</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {Object.entries(data.forecasts).map(([id, f]) => (
                <div key={id} className="rounded border border-limestone-300 bg-paper p-4">
                  <p className="font-semibold">{f.destination?.name || id}</p>
                  <Forecast forecast={f} days={7} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
