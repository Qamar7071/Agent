import { useEffect, useRef, useState } from 'react';
import { CalendarDays, MapPin, Users, Wallet, Search } from 'lucide-react';
import { destinations, matchDestinations } from '../../data/destinations.js';
import { useApp } from '../../context/AppContext.jsx';
import { daysBetween, todayIso } from '../../lib/format.js';

const budgets = [
  { value: '', label: 'Any budget' },
  { value: '50000', label: 'Up to PKR 50k' },
  { value: '100000', label: 'Up to PKR 100k' },
  { value: '200000', label: 'Up to PKR 200k' },
  { value: '400000', label: 'Up to PKR 400k' },
];

const short = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

function DatesField({ start, end, setStart, setEnd }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !wrap.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = start ? `${short(start)} – ${end ? short(end) : 'Check out'}` : 'Travel dates';

  return (
    <div ref={wrap} className="relative flex min-w-0 flex-1 items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="hero-dates"
        onClick={() => setOpen((v) => !v)}
        className="flex h-full w-full min-w-0 items-center gap-2.5 px-4 py-3 text-left lg:py-0"
      >
        <CalendarDays size={19} className="shrink-0 text-ink-600" aria-hidden="true" />
        <span className={`truncate text-[15px] font-medium ${start ? 'text-ink' : 'text-ink-500'}`}>{label}</span>
      </button>
      {open && (
        <div id="hero-dates" className="absolute left-0 top-[calc(100%+14px)] z-30 grid w-[300px] gap-3 rounded-2xl bg-white p-4 text-ink shadow-panel ring-1 ring-black/5">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-600">
            Check in
            <input type="date" min={todayIso()} value={start} onChange={(e) => setStart(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-[15px] font-medium text-ink focus:border-brand focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-600">
            Check out
            <input type="date" min={start || todayIso()} value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-[15px] font-medium text-ink focus:border-brand focus:outline-none" />
          </label>
          <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl bg-brand text-[14px] font-semibold text-white hover:bg-brand-600">Done</button>
        </div>
      )}
    </div>
  );
}

export default function SearchBar() {
  const { openPlanner } = useApp();
  const [where, setWhere] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [travelers, setTravelers] = useState('2');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (end && start && end < start) {
      setError('Your check-out date is before your check-in date.');
      return;
    }
    setError('');
    const exact = destinations.find((d) => d.name.toLowerCase() === where.trim().toLowerCase());
    const ids = exact ? [exact.id] : matchDestinations(where);
    const days = daysBetween(start, end);
    openPlanner(
      {
        destinations: ids.length ? ids : undefined,
        startDate: start || undefined,
        days: days && days >= 2 ? Math.min(days, 21) : undefined,
        travelers: Number(travelers),
        budget: budget ? Number(budget) : undefined,
      },
      { autoSubmit: ids.length > 0 },
    );
  };

  const cell = 'flex min-w-0 items-center gap-2.5 px-4 py-3 lg:py-0';
  const control = 'w-full min-w-0 bg-transparent text-[15px] font-medium text-ink placeholder:text-ink-500 focus:outline-none';
  const divider = 'hidden h-8 w-px shrink-0 bg-line lg:block';

  return (
    <form onSubmit={submit} aria-label="Search trips">
      <div className="flex flex-col gap-1 rounded-[22px] bg-white p-2 shadow-panel lg:h-[68px] lg:flex-row lg:items-center lg:rounded-full lg:pl-3">
        <label className={`${cell} lg:flex-1`}>
          <MapPin size={19} className="shrink-0 text-ink-600" aria-hidden="true" />
          <span className="sr-only">Where do you want to go?</span>
          <input id="hero-where" list="dest-options" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Where to?" className={control} />
          <datalist id="dest-options">
            {destinations.map((d) => (
              <option key={d.id} value={d.name} />
            ))}
          </datalist>
        </label>
        <span aria-hidden="true" className={divider} />
        <DatesField start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <span aria-hidden="true" className={divider} />
        <label className={`${cell} lg:flex-none`}>
          <Users size={19} className="shrink-0 text-ink-600" aria-hidden="true" />
          <span className="sr-only">Travellers</span>
          <select value={travelers} onChange={(e) => setTravelers(e.target.value)} className={`${control} cursor-pointer lg:w-[112px]`}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? 'Traveller' : 'Travellers'}</option>
            ))}
          </select>
        </label>
        <span aria-hidden="true" className={divider} />
        <label className={`${cell} lg:flex-none`}>
          <Wallet size={19} className="shrink-0 text-ink-600" aria-hidden="true" />
          <span className="sr-only">Budget</span>
          <select value={budget} onChange={(e) => setBudget(e.target.value)} className={`${control} cursor-pointer lg:w-[124px]`}>
            {budgets.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-[15px] font-semibold text-white shadow-brand transition hover:bg-brand-600 lg:rounded-full">
          <Search size={18} strokeWidth={2.5} aria-hidden="true" />
          Plan My Journey
        </button>
      </div>
      {error && <p role="alert" className="mt-2 pl-4 text-[13.5px] font-semibold text-white">{error}</p>}
    </form>
  );
}
