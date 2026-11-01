// "When to go": the months that suit every place in the plan, from the guide's typical seasons.
// Typical patterns only, not a forecast; it never says a road is open.
import { CalendarDays } from 'lucide-react';
import { byId, seasonFit, seasonNotes, seasonOf } from '../../lib/data.js';
import { MONTHS, MONTHS_SHORT } from '../../lib/format.js';
import { advise, runsOf } from '../../lib/bestMonths.js';

const names = (ids) => {
  const n = ids.map((id) => byId[id]?.name || id);
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
};
const span = (months) => runsOf(months)
  .map((r) => (r.length > 1 ? `${MONTHS[r[0] - 1]} to ${MONTHS[r.at(-1) - 1]}` : MONTHS[r[0] - 1]))
  .join(' and ');

const CELL = {
  best: 'bg-juniper-600',
  possible: 'bg-juniper-200',
  closed: 'bg-[repeating-linear-gradient(135deg,#B9BFB1_0_2px,transparent_2px_5px)] border border-limestone-400',
  none: 'bg-limestone-300',
};

export default function BestMonths({ ids, month = null }) {
  const places = (ids || []).filter((id) => byId[id]);
  if (!places.length) return null;
  const a = advise(places, seasonFit, month);
  const lead = a.best.length
    ? `${span(a.best)} suit${a.best.length === 1 ? 's' : ''} every place in this plan.`
    : a.fallback.length
      ? `No month is the best time for every place. ${span(a.fallback)} come${a.fallback.length === 1 ? 's' : ''} closest.`
      : 'No month suits all of these places well.';
  const pool = a.best.length ? a.best : a.fallback;
  const note = pool.length ? seasonNotes[seasonOf(pool[Math.floor(pool.length / 2)])] : null;   // the heart of the best period
  return (
    <section aria-labelledby="bm-h" className="panel mb-5 p-4 sm:p-5">
      <h3 id="bm-h" className="flex items-center gap-2 font-bold"><CalendarDays size={18} aria-hidden="true" /> When to go</h3>
      <p className="mt-1">{lead}</p>
      <div className="mt-3" role="img" aria-label={`Best months for every place: ${a.best.length ? span(a.best) : 'none'}`}>
        <div className="grid grid-cols-12 gap-1">
          {a.table.map((r) => (
            <span key={r.month} className={`h-6 rounded-sm ${CELL[r.verdict]} ${month === r.month ? 'outline outline-2 outline-offset-2 outline-apricot' : ''}`} />
          ))}
        </div>
        <div className="mt-1 grid grid-cols-12 gap-1 text-center text-[11px] text-ink-600" aria-hidden="true">
          {MONTHS_SHORT.map((m, i) => <span key={m} className={month === i + 1 ? 'font-bold text-ink' : ''}>{m}</span>)}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${CELL.best}`} /> Best for every place</li>
        <li className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${CELL.possible}`} /> Possible, not best for all</li>
        <li className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${CELL.closed}`} /> A seasonal road usually closed</li>
      </ul>
      {a.chosen && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">In {MONTHS[month - 1]}:</span>{' '}
          {a.chosen.verdict === 'best' && 'a good time for every place.'}
          {a.chosen.closed.length > 0 && `access to ${names(a.chosen.closed)} is usually closed by snow. `}
          {a.chosen.verdict !== 'best' && a.chosen.possible.length > 0 && `${names(a.chosen.possible)} ${a.chosen.possible.length === 1 ? 'is' : 'are'} past or before ${a.chosen.possible.length === 1 ? 'its' : 'their'} best.`}
        </p>
      )}
      {note && <p className="mt-2 text-sm text-ink-600">{note}</p>}
      <p className="mt-2 text-xs text-ink-500">Typical seasons from Raahi’s guide, not a forecast. Check road status before you travel.</p>
    </section>
  );
}
