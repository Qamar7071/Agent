import { useMemo, useState } from 'react';
import { Link } from '../../lib/router.jsx';
import { destinations, seasonFit, seasonalRouteFor } from '../../lib/data.js';
import { MONTHS, MONTHS_SHORT, metres } from '../../lib/format.js';
import Photo from '../ui/Photo.jsx';
import MonthStrip from '../ui/MonthStrip.jsx';

const FIT_ORDER = { best: 0, possible: 1, closed: 2 };

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

export default function DestinationIndex() {
  const [month, setMonth] = useState(null);
  const list = useMemo(() => {
    if (!month) return destinations;
    return [...destinations].sort((a, b) => FIT_ORDER[seasonFit(a.id, month)] - FIT_ORDER[seasonFit(b.id, month)]);
  }, [month]);

  return (
    <section id="destinations" aria-labelledby="dest-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <div className="flex flex-col gap-6">
          <div>
            <h2 id="dest-title" className="type-wide text-3xl font-extrabold sm:text-4xl">Where to go</h2>
            <p className="mt-3 max-w-prose text-ink-600">
              Eight places along the Karakoram Highway and in Baltistan. Choose your travel month to see what is usually
              in season. High passes and plateaus open and close with the snow.
            </p>
          </div>
          <div role="group" aria-label="Travel month" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            <button type="button" aria-pressed={month === null} onClick={() => setMonth(null)} className="chip shrink-0">Any month</button>
            {MONTHS_SHORT.map((m, i) => (
              <button key={m} type="button" aria-pressed={month === i + 1} onClick={() => setMonth(i + 1)} className="chip num shrink-0 px-2.5" aria-label={MONTHS[i]}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((d) => {
            const fit = month ? fitText(d.id, month) : null;
            return (
              <li key={d.id}>
                <Link to={`/destinations/${d.id}`} className="group block rounded focus-visible:outline-offset-4">
                  <div className="aspect-[4/3] overflow-hidden rounded">
                    {/* On 3x phone screens, ask for a 2x image: it looks the same and is half the download. */}
                    <Photo id={d.id} sizes="(min-width: 1024px) 290px, (min-width: 640px) 45vw, (min-resolution: 2.5dppx) 61vw, 92vw" className="transition-transform duration-500 group-hover:scale-[1.03]" />
                  </div>
                  <h3 className="type-wide mt-4 text-xl font-bold leading-tight group-hover:underline group-hover:decoration-apricot group-hover:decoration-2 group-hover:underline-offset-4">{d.name}</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    {d.region.replace(' · ', ', ')}, <span className="num">{metres(d.altitude_m)}</span>
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
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
