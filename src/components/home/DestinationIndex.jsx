import { useMemo, useState } from 'react';
import { Mountain, Search, SlidersHorizontal, X } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { byId, destinations, seasonFit, seasonalRouteFor } from '../../lib/data.js';
import { MONTHS, MONTHS_SHORT, metres, plural } from '../../lib/format.js';
import { filterDestinations, CATEGORY_LABELS } from '../../lib/discover.js';
import Photo from '../ui/Photo.jsx';
import MonthStrip from '../ui/MonthStrip.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';
import HeartButton from '../shared/HeartButton.jsx';
import { useSavedPlaces } from '../../lib/wishlist.js';

export function closedMonths(id) {
  const route = seasonalRouteFor(id);
  return route ? Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !route.typical_open_months.includes(m)) : [];
}

function fitText(id, month) {
  const fit = seasonFit(id, month);
  if (fit === 'best') return { text: `Usually at its best in ${MONTHS[month - 1]}`, tone: 'text-juniper-600' };
  if (fit === 'closed') return { text: `Access usually closed by snow in ${MONTHS[month - 1]}`, tone: 'text-brick' };
  return { text: `Possible in ${MONTHS[month - 1]}, outside the usual season`, tone: 'text-ochre' };
}

function SavedBar() {
  const saved = useSavedPlaces().filter((id) => byId[id]);
  if (!saved.length) return null;
  const names = saved.map((id) => byId[id].name);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-limestone-300 bg-paper p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 text-sm">
        <span className="font-semibold">Your saved places:</span> {names.join(', ')}
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link to={`/plan?d=${saved.join(',')}`} className="btn-primary min-h-[44px]">Plan a trip with {saved.length === 1 ? 'it' : 'these'}</Link>
      </div>
    </div>
  );
}

const SORTS = [['season', 'Best for the month'], ['altitude', 'Altitude'], ['days', 'Time needed']];

export default function DestinationIndex() {
  const [month, setMonth] = useState(null);
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState([]);
  const [sort, setSort] = useState('season');
  const list = useMemo(() => filterDestinations(destinations, { query, categories: cats, month, sort, seasonFit }),
    [query, cats, month, sort]);
  const filtering = Boolean(query.trim() || cats.length || month);
  const clear = () => { setQuery(''); setCats([]); setMonth(null); setSort('season'); };

  return (
    <section id="destinations" aria-labelledby="dest-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="dest-title" eyebrow="Explore Northern Pakistan" title="Eight places, one honest guide">
            Valleys, lakes, high passes and treks along the Karakoram Highway and in Baltistan. Search, filter by what you
            love, or pick your travel month to see what is usually in season.
          </SectionHeader>
        </Reveal>

        <div className="mt-8 flex flex-col gap-4">
          <SavedBar />
          <div className="card flex flex-col gap-4 p-3 sm:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" aria-hidden="true" />
                <label htmlFor="dest-search" className="sr-only">Search destinations</label>
                <input id="dest-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={60}
                  placeholder="Search: lake, fort, Baltistan, Nanga Parbat…" className="field pl-10" autoComplete="off" />
              </div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="shrink-0 text-ink-500" aria-hidden="true" />
                <label htmlFor="dest-sort" className="text-sm font-medium text-ink-700">Sort</label>
                <select id="dest-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="field min-h-[44px] w-auto py-0 text-sm">
                  {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div role="group" aria-label="Kind of place" className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={cats.includes(id)} className="chip"
                  onClick={() => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}>{label}</button>
              ))}
            </div>
            <div role="group" aria-label="Travel month" className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              <button type="button" aria-pressed={month === null} onClick={() => setMonth(null)} className="chip shrink-0">Any month</button>
              {MONTHS_SHORT.map((m, i) => (
                <button key={m} type="button" aria-pressed={month === i + 1} onClick={() => setMonth(i + 1)} className="chip num shrink-0 px-2.5" aria-label={MONTHS[i]}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-ink-600" aria-live="polite">
            <span>{filtering ? `${plural(list.length, 'place')} match` : `${plural(list.length, 'place')}`}{month ? `, sorted for ${MONTHS[month - 1]}` : ''}</span>
            {filtering && <button type="button" onClick={clear} className="btn-quiet min-h-[36px] text-sm"><X size={14} aria-hidden="true" /> Clear filters</button>}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-limestone-400 p-8 text-center">
            <p className="font-semibold">No place matches all of that.</p>
            <p className="mt-1 text-sm text-ink-600">Try fewer filters, or another word.</p>
            <button type="button" onClick={clear} className="btn-outline mt-4">Show all eight</button>
          </div>
        ) : (
          <ul className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((d, i) => {
              const fit = month ? fitText(d.id, month) : null;
              return (
                <Reveal as="li" key={d.id} delay={(i % 4) * 70} className="relative">
                  <HeartButton id={d.id} name={d.name} overlay className="absolute right-3 top-3 z-10" />
                  <Link to={`/destinations/${d.id}`} className="group block rounded-2xl focus-visible:outline-offset-4">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-card">
                      {/* On 3x phone screens, ask for a 2x image: it looks the same and is half the download. */}
                      <Photo id={d.id} sizes="(min-width: 1024px) 290px, (min-width: 640px) 45vw, (min-resolution: 2.5dppx) 61vw, 92vw" className="transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                      <span className="num absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                        <Mountain size={12} aria-hidden="true" /> {metres(d.altitude_m)}
                      </span>
                    </div>
                    <h3 className="type-wide mt-4 text-xl font-bold leading-tight group-hover:underline group-hover:decoration-apricot group-hover:decoration-2 group-hover:underline-offset-4">{d.name}</h3>
                    <p className="mt-1 text-sm text-ink-600">
                      {d.region.replace(' · ', ', ')} · {d.category.map((c) => CATEGORY_LABELS[c]).filter(Boolean).join(', ')}
                    </p>
                    <div className="mt-3">
                      <MonthStrip best={d.best_months} closed={closedMonths(d.id)} selected={month} />
                    </div>
                    <p className={`mt-2 text-sm font-medium ${fit ? fit.tone : 'text-ink-600'}`}>
                      {fit ? fit.text : d.season_note}
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      {d.recommended_days.min === d.recommended_days.max
                        ? `${d.recommended_days.min} day`
                        : `${d.recommended_days.min}–${d.recommended_days.max} days`} recommended
                    </p>
                  </Link>
                </Reveal>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
