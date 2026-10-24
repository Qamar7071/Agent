import { ArrowUpRight, CalendarDays, ExternalLink, MapPin } from 'lucide-react';
import { destinationById } from '../../data/destinations.js';
import { coords } from '../../data/logistics.js';
import { sourcesFor } from '../../lib/images.js';
import { metres, pkr } from '../../lib/format.js';
import SmartImage from '../ui/SmartImage.jsx';
import WeatherCard from '../weather/WeatherCard.jsx';
import { useApp } from '../../context/AppContext.jsx';

export function WeatherBlock({ id }) {
  const d = destinationById[id];
  const ll = coords[id];
  if (!d || !ll) return null;
  return <WeatherCard lat={ll[0]} lng={ll[1]} name={d.name} altitude={d.altitude} compact />;
}

export function DestinationStrip({ ids }) {
  const { openDestination } = useApp();
  if (!ids?.length) return null;
  return (
    <ul className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" aria-label="Suggested destinations">
      {ids.map((id) => {
        const d = destinationById[id];
        if (!d) return null;
        return (
          <li key={id} className="w-[160px] shrink-0 snap-start">
            <button type="button" onClick={() => openDestination(id)} className="group block w-full overflow-hidden rounded-2xl border border-line bg-white text-left shadow-sm transition hover:border-brand-300 hover:shadow-card">
              <SmartImage sources={sourcesFor(id, 400)} alt={d.name} tone={d.tone} className="h-[88px]" imgClassName="transition duration-500 group-hover:scale-105" />
              <span className="flex flex-col gap-0.5 p-3">
                <span className="text-[13.5px] font-semibold leading-tight text-ink">{d.name}</span>
                <span className="text-[12px] text-ink-500">{metres(d.altitude)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ItinerarySummary({ plan }) {
  const { openPlanner } = useApp();
  if (!plan?.days?.length) return null;
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
      <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
        <CalendarDays size={16} className="text-brand" aria-hidden="true" />
        {plan.title}
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {plan.days.slice(0, 6).map((d) => (
          <li key={d.day} className="flex gap-3 text-[13px]">
            <span className="w-12 shrink-0 font-semibold text-brand">Day {d.day}</span>
            <span className="text-ink-700">{d.title}</span>
          </li>
        ))}
        {plan.days.length > 6 && <li className="pl-[60px] text-[12.5px] text-ink-500">+ {plan.days.length - 6} more days</li>}
      </ol>
      {pkr(plan.totalCost) && <p className="mt-3 text-[13px] text-ink-600">Estimated total: <strong className="text-ink">{pkr(plan.totalCost)}</strong></p>}
      <button type="button" onClick={() => openPlanner({ externalPlan: plan })} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-600">
        Open full plan <ArrowUpRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function LinkList({ links }) {
  if (!links?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {links.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[13.5px] font-medium text-brand underline-offset-4 hover:underline">
            <ExternalLink size={14} aria-hidden="true" />
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ActionChips({ actions }) {
  const { runAction } = useApp();
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <button
          key={`${a.label}-${i}`}
          type="button"
          onClick={() => runAction(a)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
        >
          {a.type === 'planner' ? <CalendarDays size={14} className="text-brand" aria-hidden="true" /> : <MapPin size={14} className="text-brand" aria-hidden="true" />}
          {a.label}
        </button>
      ))}
    </div>
  );
}
