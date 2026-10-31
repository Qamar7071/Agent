// "Plan": the itinerary the group started with, today highlighted, with any change accepted on the way.
import { Link } from '../../lib/router.jsx';
import { strings } from '../../lib/companion/i18n.js';

export default function PlanTab({ hub }) {
  const { c, s, dayIndex } = hub;
  const label = (altId) => (altId === 'stay_down' ? s.optionStay : s.optionBus);
  return (
    <div className="flex flex-col gap-3">
      {(c.settings.adjustments || []).map((a) => (
        <p key={`${a.altId}-${a.fromDay}`} className="rounded border border-juniper-200 bg-juniper-50 px-3 py-2 text-sm text-ink">
          {s.changedFrom(label(a.altId), a.fromDay)}
        </p>
      ))}
      <ol className="flex flex-col gap-3">
        {c.plan.days.map((d) => (
          <li key={d.day} aria-current={d.day === dayIndex ? 'date' : undefined}
            className={`panel p-4 ${d.day === dayIndex ? 'border-juniper-600 ring-2 ring-juniper-200' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{s.dayN(d.day)}{d.date ? ` · ${d.date}` : ''}</p>
            <p className="mt-0.5 font-semibold">{d.title}</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-700">
              {d.moves.filter((m) => m.depart).map((m) => (
                <li key={`${m.from_name}-${m.to_name}`}>{m.from_name} → {m.to_name}: {s.leave(m.depart)} ({m.time_label})</li>
              ))}
              {d.activities.slice(0, 3).map((a) => <li key={a}>{a}</li>)}
              {d.overnight?.name && <li className="text-ink-600">{s.stayIn(d.overnight.name)}</li>}
            </ul>
          </li>
        ))}
      </ol>
      <Link to={c.server ? `/plan?trip=${c.server.id}` : '/plan'} className="btn-outline self-start">{strings(hub.lang).planInPlanner}</Link>
    </div>
  );
}
