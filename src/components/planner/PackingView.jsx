// Packing list from the Packing Intelligence agent (which uses the Weather agent's forecast).
// Ticks are kept in this browser for this trip.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAgentRun } from '../../lib/agentRun.js';
import { Link } from '../../lib/router.jsx';
import { read, write } from '../../lib/store.js';

const PRIORITY = { essential: 'Essential', recommended: 'Recommended', optional: 'Optional' };

export default function PackingView({ itinerary }) {
  const run = useAgentRun();
  const [list, setList] = useState(null);
  const key = `raahi:packing:${itinerary.title}:${itinerary.request.start_date || ''}`;
  const [ticked, setTicked] = useState(() => read(key, {}));

  useEffect(() => {
    let live = true;
    run.start(api.runAgents, { request: itinerary.request, intent: 'packing' }, `Packing: ${itinerary.title}`)
      .then((res) => { if (live && res) setList(res.agents?.packing || null); });
    return () => { live = false; };
  }, [itinerary.request]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (name) => {
    const next = { ...ticked, [name]: !ticked[name] };
    setTicked(next);
    write(key, next);
  };

  if (run.status === 'running') return <p className="text-sm text-ink-600" role="status">The packing and weather agents are working…</p>;
  if (run.error) {
    return (
      <p className="text-sm text-brick" role="alert">{run.error.message}{' '}
        <button type="button" className="link" onClick={() => run.start(api.runAgents, { request: itinerary.request, intent: 'packing' }, `Packing: ${itinerary.title}`).then((r) => r && setList(r.agents?.packing))}>Try again</button>
      </p>
    );
  }
  if (!list) return null;
  const groups = ['essential', 'recommended', 'optional'].map((p) => [p, list.items.filter((i) => i.priority === p)]).filter(([, i]) => i.length);
  const done = list.items.filter((i) => ticked[i.name]).length;
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-ink-600">
        Built by the packing agent from your places, season and {list.basis}. <span className="num">{done}/{list.items.length}</span> packed.
        {run.run && <> <Link to={`/agents?run=${run.run.id}`} className="link">See the agents that made it</Link>.</>}
      </p>
      {groups.map(([p, items]) => (
        <fieldset key={p}>
          <legend className="font-semibold">{PRIORITY[p]}</legend>
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.name}>
                <label className="flex cursor-pointer gap-3 rounded border border-limestone-300 bg-paper p-3">
                  <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-[rgb(var(--c-juniper))]" checked={!!ticked[i.name]} onChange={() => toggle(i.name)} />
                  <span>
                    <span className={`font-medium ${ticked[i.name] ? 'text-ink-500 line-through' : ''}`}>{i.name}</span>
                    <span className="ml-2 text-xs text-ink-500">{i.category}</span>
                    <span className="block text-sm text-ink-600">{i.why}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
