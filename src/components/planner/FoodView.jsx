import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../../lib/api.js';
import PlaceList, { PLACE_TOWNS } from './PlaceList.jsx';

function TownFood({ town, name }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, data: null, error: null });
    api.places(town, 'food', {}, { signal: ctrl.signal })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((e) => { if (e.kind !== 'cancelled') setState({ loading: false, data: null, error: e.message }); });
    return () => ctrl.abort();
  }, [town, attempt]);

  const d = state.data;
  return (
    <li className="rounded border border-limestone-300 bg-paper p-4">
      <h3 className="type-semiwide text-lg font-bold">{d?.name || name}</h3>
      {state.loading && <p className="mt-1 text-sm text-ink-600" role="status">Looking up food…</p>}
      {state.error && (
        <p className="mt-1 text-sm text-brick" role="alert">
          {state.error} <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      )}
      {d && (
        <>
          {d.message && <p className="mt-1 text-sm text-ink-700">{d.message}</p>}
          {d.dishes && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold">Local food: {d.dishes.area}</h4>
              <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {d.dishes.dishes.map((x) => (
                  <li key={x.name}><span className="font-medium">{x.name}</span>: <span className="text-ink-600">{x.about}</span></li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-500">{d.dishes.status}</p>
            </div>
          )}
          {d.live && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Restaurants and cafés</h4>
              <PlaceList live={d.live} kind="food" />
            </div>
          )}
          {d.check_prices?.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="link mt-2 inline-flex items-center gap-1 py-1 text-xs">
              <ExternalLink size={13} aria-hidden="true" /> {l.label}
            </a>
          ))}
          {d.note && <p className="mt-2 text-xs text-ink-500">{d.note}</p>}
        </>
      )}
    </li>
  );
}

// Food for each town the plan sleeps in or visits.
export default function FoodView({ itinerary }) {
  const towns = [];
  const add = (key, name) => {
    if (PLACE_TOWNS.includes(key) && !towns.some((t) => t.key === key)) towns.push({ key, name });
  };
  itinerary.stays.forEach((s) => add(s.hub, s.name));
  itinerary.request.destinations.forEach((d) => add(d, d));

  if (!towns.length) return <p className="text-sm text-ink-600">No food listings for the places in this plan.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-ink-600">
        Local dishes worth trying, and restaurants and cafés that OpenStreetMap knows about near each stop.
      </p>
      <ul className="flex flex-col gap-5">
        {towns.map((t) => <TownFood key={t.key} town={t.key} name={t.name} />)}
      </ul>
    </div>
  );
}
