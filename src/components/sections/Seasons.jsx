import { useMemo, useState } from 'react';
import { ArrowUpRight, Snowflake, Flower2, Sun, Leaf, Mountain } from 'lucide-react';
import { destinations, months, seasonNotes, seasonOf } from '../../data/destinations.js';
import { sourcesFor } from '../../lib/images.js';
import { metres, monthShort } from '../../lib/format.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import SectionHeading from '../ui/SectionHeading.jsx';

const seasonStyle = {
  winter: { icon: Snowflake, tone: 'bg-brand-50 text-brand' },
  spring: { icon: Flower2, tone: 'bg-rose-50 text-rose' },
  summer: { icon: Sun, tone: 'bg-sun-50 text-sun' },
  autumn: { icon: Leaf, tone: 'bg-[#FFF1E6] text-[#EA580C]' },
};

export default function Seasons() {
  const { openDestination } = useApp();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const season = seasonOf(month);
  const { icon: Icon, tone } = seasonStyle[season];
  const picks = useMemo(() => destinations.filter((d) => d.bestMonths.includes(month)), [month]);

  return (
    <section id="seasons" aria-labelledby="season-title" className="bg-white py-16 sm:py-24">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 sm:px-8">
        <SectionHeading id="season-title" eyebrow="Seasonal Recommendations" title="Go when the mountains" accent="say yes">
          Passes, plateaus and treks open and close with the snow. Pick a month to see what is in season.
        </SectionHeading>

        <div role="tablist" aria-label="Choose a month" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {monthShort.map((m, i) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={month === i + 1}
              aria-controls="season-panel"
              onClick={() => setMonth(i + 1)}
              className={`h-10 min-w-[60px] shrink-0 rounded-full px-4 text-[14px] font-semibold transition ${month === i + 1 ? 'bg-brand text-white shadow-brand' : 'border border-line text-ink-600 hover:border-brand-300 hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <div id="season-panel" role="tabpanel" aria-label={months[month - 1]} className="grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.75fr)]">
          <div className="flex flex-col gap-3 rounded-[24px] border border-line bg-surface p-7">
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${tone}`}><Icon size={24} aria-hidden="true" /></span>
            <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-ink-500">{season}</p>
            <h3 className="font-display text-[38px] font-bold leading-none text-ink">{months[month - 1]}</h3>
            <p className="text-[15.5px] leading-relaxed text-ink-600">{seasonNotes[season]}</p>
            <p className="mt-auto pt-3 text-[13px] font-semibold text-brand">{picks.length} of {destinations.length} destinations in season</p>
          </div>

          {picks.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {picks.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => openDestination(d.id)} className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
                    <SmartImage sources={sourcesFor(d.id, 700)} alt={d.name} tone={d.tone} className="h-36" imgClassName="transition-transform duration-700 group-hover:scale-105" />
                    <span className="flex flex-1 flex-col gap-1 p-4">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-display text-[17px] font-semibold text-ink">{d.name}</span>
                        <ArrowUpRight size={17} className="text-ink-400 transition group-hover:text-brand" aria-hidden="true" />
                      </span>
                      <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-500"><Mountain size={12} aria-hidden="true" /> {metres(d.altitude)}</span>
                      <span className="text-[13.5px] text-ink-600">{d.seasonNote}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col justify-center gap-3 rounded-[24px] border border-dashed border-line p-8">
              <p className="font-display text-[21px] font-semibold text-ink">A quiet month in the high country</p>
              <p className="max-w-lg text-[15px] text-ink-600">None of the featured routes are at their best in {months[month - 1]}. Skardu and Hunza towns remain reachable for snowy, slow travel — check road and flight status before you go.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
