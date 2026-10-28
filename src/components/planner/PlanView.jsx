import { useEffect, useRef, useState } from 'react';
import { BookmarkCheck, Mail, Pencil, Printer, Save } from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { MONTHS, dayLabel, pkr, plural } from '../../lib/format.js';
import Notice from '../ui/Notice.jsx';
import DayCard from './DayCard.jsx';
import BudgetView from './BudgetView.jsx';
import ConditionsView from './ConditionsView.jsx';
import StaysView from './StaysView.jsx';
import FoodView from './FoodView.jsx';

const TABS = [
  ['itinerary', 'Day by day'],
  ['budget', 'Budget'],
  ['conditions', 'Weather and roads'],
  ['stays', 'Stays'],
  ['food', 'Food'],
];
const TRANSPORT = { car: 'hired car with driver', bus: 'public coach', flight: 'flying north' };
const STAY = { budget: 'budget stays', mid: 'mid-range stays', premium: 'premium stays' };

function Empty({ onOpenForm }) {
  const { send } = usePlanner();
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-2 py-16">
      <h2 className="type-wide text-2xl font-extrabold">No plan yet</h2>
      <p className="text-ink-600">
        Describe your trip in the chat, or fill in the trip details. Your plan appears here with drive times, where you
        sleep, a cost estimate and the forecast for your dates.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onOpenForm} className="btn-primary">Fill in trip details</button>
        <button type="button" onClick={() => send('Suggest a 6-day trip for 2 people from Islamabad')} className="btn-outline">Ask Raahi for ideas</button>
      </div>
    </div>
  );
}

function SaveButton() {
  const { saveTrip, savedTrip, unsaved, health } = usePlanner();
  const [state, setState] = useState({ busy: false, error: null });
  const storageOff = health && !health.storage?.enabled;
  if (storageOff) {
    return (
      <button type="button" disabled className="btn-outline" title="Saving needs a database, which this deployment doesn’t have yet.">
        <Save size={16} aria-hidden="true" /> Saving unavailable
      </button>
    );
  }
  const saved = savedTrip && !unsaved;
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={state.busy || saved}
        onClick={async () => {
          setState({ busy: true, error: null });
          try {
            await saveTrip();
            setState({ busy: false, error: null });
          } catch (e) {
            setState({ busy: false, error: e.message });
          }
        }}
        className="btn-outline"
      >
        {saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        {state.busy ? 'Saving…' : saved ? 'Saved' : savedTrip ? 'Save changes' : 'Save trip'}
      </button>
      {state.error && <span className="mt-1 max-w-[16rem] text-xs text-brick" role="alert">{state.error}</span>}
    </span>
  );
}

export default function PlanView({ onOpenForm }) {
  const { itinerary, planBusy, planError, setPlanError, openEnquiry, conditions } = usePlanner();
  const [tab, setTab] = useState('itinerary');
  const tabRefs = useRef({});
  useEffect(() => {
    if (!itinerary) setTab('itinerary');
  }, [itinerary]);

  if (!itinerary) return <Empty onOpenForm={onOpenForm} />;
  const r = itinerary.request;
  const when = r.start_date
    ? `${dayLabel(itinerary.days[0].date)} to ${dayLabel(itinerary.days[itinerary.days.length - 1].date)}`
    : r.travel_month ? `in ${MONTHS[r.travel_month - 1]}` : 'dates not set';
  const people = `${plural(r.adults, 'adult')}${r.children ? `, ${plural(r.children, 'child', 'children')}` : ''}`;
  const dayWeather = Object.fromEntries((conditions.data?.day_weather || []).map((w) => [w.day, w]));
  const top = itinerary.warnings.filter((w) => w.level !== 'info');
  const info = itinerary.warnings.filter((w) => w.level === 'info');

  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-8" aria-busy={planBusy}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="type-wide text-2xl font-extrabold leading-tight sm:text-3xl">{itinerary.title}</h2>
          <p className="mt-1 text-sm text-ink-600">
            {plural(itinerary.days.length, 'day')} from {r.origin}, {when}. {people}, {TRANSPORT[r.transport]}, {STAY[r.accommodation]}.
          </p>
          <p className="mt-1 text-sm">
            Estimated cost <strong className="num">{pkr(itinerary.budget.total)}</strong>
            <span className="text-ink-600"> (estimate, not a quote)</span>
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" onClick={onOpenForm} className="btn-outline"><Pencil size={16} aria-hidden="true" /> Trip details</button>
          <SaveButton />
          <button type="button" onClick={() => openEnquiry({})} className="btn-primary"><Mail size={16} aria-hidden="true" /> Send enquiry</button>
          <button type="button" onClick={() => window.print()} className="btn-quiet" aria-label="Print the plan"><Printer size={16} aria-hidden="true" /></button>
        </div>
      </div>

      {planError && (
        <Notice level="danger" title="That change didn’t work" className="mt-5" action={<button type="button" className="btn-quiet" onClick={() => setPlanError(null)}>Dismiss</button>}>
          {planError.message}
        </Notice>
      )}

      <div role="tablist" aria-label="Plan views" className="no-print no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-limestone-300">
        {TABS.map(([id, label], i) => (
          <button
            key={id}
            ref={(el) => { tabRefs.current[id] = el; }}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? 'border-juniper text-juniper' : 'border-transparent text-ink-600 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-4" tabIndex={0}>
        {tab === 'itinerary' && (
          <>
            {top.length > 0 && (
              <div className="mb-2 flex flex-col gap-2">
                {top.map((w) => <Notice key={w.code + w.message} level={w.level}>{w.message}</Notice>)}
              </div>
            )}
            <ol className="flex flex-col">
              {itinerary.days.map((d) => <DayCard key={d.key + d.day} day={d} weather={dayWeather[d.day]} />)}
            </ol>
            {info.length > 0 && (
              <div className="mt-6 flex flex-col gap-2">
                {info.map((w) => <Notice key={w.code + w.message} level="info">{w.message}</Notice>)}
              </div>
            )}
            <p className="mt-6 text-xs text-ink-500">{itinerary.honesty}</p>
          </>
        )}
        {tab === 'budget' && <BudgetView budget={itinerary.budget} />}
        {tab === 'conditions' && <ConditionsView />}
        {tab === 'stays' && <StaysView stays={itinerary.stays} budget={itinerary.budget} />}
        {tab === 'food' && <FoodView itinerary={itinerary} />}
      </div>

      {planBusy && (
        <div className="absolute inset-0 flex items-start justify-center bg-limestone/60 pt-24" role="status">
          <p className="rounded bg-paper px-4 py-2 text-sm font-semibold shadow">Updating the plan…</p>
        </div>
      )}
    </div>
  );
}
