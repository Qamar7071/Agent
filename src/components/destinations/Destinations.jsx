import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Heart, MapPin, Mountain, ChevronDown } from 'lucide-react';
import { categories, destinations } from '../../data/destinations.js';
import { sourcesFor } from '../../lib/images.js';
import { metres } from '../../lib/format.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import SectionHeading from '../ui/SectionHeading.jsx';
import Reveal from '../ui/Reveal.jsx';

const badges = {
  hunza: { label: 'Culture & Forts', tone: 'bg-brand' },
  skardu: { label: 'Crystal Lakes', tone: 'bg-teal-600' },
  attabad: { label: 'Turquoise Lake', tone: 'bg-[#0891B2]' },
  'fairy-meadows': { label: 'Meadow Trek', tone: 'bg-leaf' },
  deosai: { label: 'High Plateau', tone: 'bg-[#7C3AED]' },
  passu: { label: 'Iconic Peaks', tone: 'bg-sun' },
  khunjerab: { label: 'Highest Pass', tone: 'bg-rose' },
  k2: { label: 'Expedition', tone: 'bg-ink' },
};

const allCategories = [...categories, { id: 'saved', label: 'Saved' }];

function DestinationCard({ d }) {
  const { openDestination, saved, toggleSaved } = useApp();
  const isSaved = saved.includes(d.id);
  const days = d.duration.min === d.duration.max ? `${d.duration.min} Day` : `${d.duration.min}–${d.duration.max} Days`;
  const badge = badges[d.id];
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative">
        <SmartImage sources={sourcesFor(d.id, 800)} alt={`${d.name}, ${d.region}`} tone={d.tone} className="h-[190px]" imgClassName="transition-transform duration-700 ease-out group-hover:scale-[1.07]" />
        {badge && <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white shadow ${badge.tone}`}>{badge.label}</span>}
        <button
          type="button"
          onClick={() => toggleSaved(d.id)}
          aria-pressed={isSaved}
          aria-label={isSaved ? `Remove ${d.name} from saved` : `Save ${d.name}`}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow transition hover:scale-110"
        >
          <Heart size={17} className={isSaved ? 'fill-rose text-rose' : ''} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-500">
          <MapPin size={13} className="text-brand" aria-hidden="true" /> {d.region.split(' · ')[0]}, Gilgit-Baltistan
        </p>
        <h3 className="font-display text-[18px] font-semibold leading-snug text-ink">{d.name}</h3>
        <p className="line-clamp-2 text-[13.5px] text-ink-500">{d.tagline}</p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-ink-600">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" /> {days}</span>
          <span className="inline-flex items-center gap-1.5"><Mountain size={14} className="text-sun" aria-hidden="true" /> {metres(d.altitude)}</span>
        </div>
        <button
          type="button"
          onClick={() => openDestination(d.id)}
          className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-50 text-[13.5px] font-semibold text-brand transition after:absolute after:inset-0 after:content-[''] group-hover:bg-brand group-hover:text-white"
          aria-label={`Explore ${d.name}`}
        >
          Explore Destination <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export default function Destinations() {
  const { destFilter: cat, setDestFilter: setCat, saved } = useApp();
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => {
    if (cat === 'all') return destinations;
    if (cat === 'saved') return destinations.filter((d) => saved.includes(d.id));
    return destinations.filter((d) => d.category.includes(cat));
  }, [cat, saved]);
  const visible = cat === 'all' && !showAll ? list.slice(0, 5) : list;

  return (
    <section id="destinations" aria-labelledby="dest-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 sm:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <SectionHeading id="dest-title" eyebrow="Popular Destinations" title="Explore Northern Pakistan’s Most" accent="Amazing Places" />
          {cat === 'all' && (
            <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="inline-flex items-center gap-2 self-start text-[15px] font-semibold text-brand hover:text-brand-700 md:self-auto">
              {showAll ? 'Show fewer' : `View All ${destinations.length} Destinations`}
              {showAll ? <ChevronDown size={17} className="rotate-180" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
            </button>
          )}
        </div>

        <div role="group" aria-label="Filter destinations" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {allCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => setCat(c.id)}
              className={`h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition ${cat === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-600 hover:border-ink-400 hover:text-ink'}`}
            >
              {c.label}
              {c.id === 'saved' && saved.length > 0 && <span className="ml-1.5 rounded-full bg-rose px-1.5 text-[11px] text-white">{saved.length}</span>}
            </button>
          ))}
        </div>

        {visible.length ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {visible.map((d, i) => (
              <Reveal key={d.id} delay={(i % 5) * 60} className="h-full">
                <DestinationCard d={d} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
            <Heart size={28} className="text-rose" aria-hidden="true" />
            <p className="font-display text-[20px] font-semibold">No saved destinations yet</p>
            <p className="max-w-sm text-[14.5px] text-ink-500">Tap the heart on any destination to keep it here while you plan.</p>
            <button type="button" onClick={() => setCat('all')} className="mt-1 h-10 rounded-full bg-brand px-5 text-[14px] font-semibold text-white">Browse all destinations</button>
          </div>
        )}
      </div>
    </section>
  );
}
