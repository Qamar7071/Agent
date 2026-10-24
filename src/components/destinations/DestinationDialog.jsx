import { useEffect, useRef } from 'react';
import { X, CalendarDays, Mountain, Clock, Route, Sparkles, ExternalLink, MapPin, Heart, Navigation, Hotel } from 'lucide-react';
import { destinationById } from '../../data/destinations.js';
import { creditFor, sourcesFor } from '../../lib/images.js';
import { metres, monthRange, pkr } from '../../lib/format.js';
import { coords, stays, mapsEmbed, mapsDirections, clusterGateway } from '../../data/logistics.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import WeatherCard from '../weather/WeatherCard.jsx';

export default function DestinationDialog() {
  const { activeDestination, closeDestination, openDestination, openPlanner, askAbout, saved, toggleSaved } = useApp();
  const d = activeDestination ? destinationById[activeDestination] : null;
  const ref = useRef(null);
  const closeRef = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    if (!d) return;
    if (!lastFocus.current) lastFocus.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    ref.current?.scrollTo({ top: 0 });
    const onKey = (e) => {
      if (e.key === 'Escape') closeDestination();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button, a[href]');
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [d, closeDestination]);

  useEffect(() => {
    if (!activeDestination && lastFocus.current) {
      lastFocus.current.focus?.();
      lastFocus.current = null;
    }
  }, [activeDestination]);

  if (!d) return null;
  const credit = creditFor(d.id);
  const isSaved = saved.includes(d.id);
  const ll = coords[d.id];
  const gateway = clusterGateway[d.id];
  const stay = stays[d.id];
  const embed = mapsEmbed(d.id, d.id === 'k2' || d.id === 'deosai' ? 8 : 10);
  const facts = [
    { icon: Mountain, label: 'Altitude', value: metres(d.altitude), tone: 'text-sun' },
    { icon: CalendarDays, label: 'Best months', value: monthRange(d.bestMonths), tone: 'text-leaf' },
    { icon: Clock, label: 'Suggested stay', value: d.duration.min === d.duration.max ? `${d.duration.min} day` : `${d.duration.min}–${d.duration.max} days`, tone: 'text-brand' },
    { icon: MapPin, label: 'Coordinates', value: d.coords.replace(' · ', ', '), tone: 'text-rose' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={closeDestination} className="absolute inset-0 bg-night/60 backdrop-blur-sm" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dest-dialog-title" className="relative max-h-[92svh] w-full max-w-[960px] overflow-y-auto rounded-t-[28px] bg-white shadow-panel animate-rise sm:rounded-[28px]">
        <div className="relative">
          <SmartImage sources={sourcesFor(d.id, 1800)} alt={`${d.name}, ${d.region}`} tone={d.tone} className="h-[260px] sm:h-[360px]" eager />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/10 to-transparent" />
          <div className="absolute right-4 top-4 flex gap-2">
            <button type="button" onClick={() => toggleSaved(d.id)} aria-pressed={isSaved} aria-label={isSaved ? 'Remove from saved' : 'Save destination'} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow hover:scale-105">
              <Heart size={19} className={isSaved ? 'fill-rose text-rose' : ''} />
            </button>
            <button ref={closeRef} type="button" onClick={closeDestination} aria-label="Close destination details" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow hover:scale-105">
              <X size={20} />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white sm:p-8">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-white/90"><MapPin size={15} aria-hidden="true" /> {d.region}, Gilgit-Baltistan</p>
            <h2 id="dest-dialog-title" className="mt-1 font-display text-[clamp(2rem,4.6vw,3.2rem)] font-bold leading-tight">{d.name}</h2>
            <p className="text-[16px] text-white/90">{d.tagline}</p>
          </div>
        </div>

        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-6">
            <p className="text-[16px] leading-relaxed text-ink-700">{d.description}</p>
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-500">Highlights</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {d.highlights.map((h) => (
                  <li key={h} className="rounded-full bg-brand-50 px-3.5 py-2 text-[14px] font-medium text-brand-700">{h}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="flex items-center gap-2 font-semibold text-ink"><Route size={17} className="text-brand" aria-hidden="true" /> Getting there</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{d.access}</p>
              <p className="mt-3 text-[14px] text-ink-500">{d.seasonNote}</p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-3">
              {facts.map(({ icon: Icon, label, value, tone }) => (
                <div key={label} className="rounded-2xl border border-line p-4">
                  <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500"><Icon size={14} className={tone} aria-hidden="true" /> {label}</dt>
                  <dd className="mt-1 font-display text-[17px] font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {ll && (
              <div>
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-500">Live weather</h3>
                <div className="mt-2"><WeatherCard lat={ll[0]} lng={ll[1]} name={d.name} altitude={d.altitude} compact /></div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => { closeDestination(); openPlanner({ destinations: [d.id, ...d.nearby.slice(0, 1)] }); }} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-brand px-6 font-semibold text-white shadow-brand hover:bg-brand-600">
                <CalendarDays size={18} aria-hidden="true" /> Plan a trip here
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => askAbout(`Tell me about visiting ${d.name}`)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line px-4 text-[14px] font-semibold text-ink hover:border-brand-300 hover:bg-brand-50">
                  <Sparkles size={16} className="text-brand" aria-hidden="true" /> Ask Raahi
                </button>
                {gateway && (
                  <a href={mapsDirections(gateway, d.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line px-4 text-[14px] font-semibold text-ink hover:border-brand-300 hover:bg-brand-50">
                    <Navigation size={16} className="text-brand" aria-hidden="true" /> Directions
                  </a>
                )}
              </div>
            </div>

            {stay && (
              <div>
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-500"><Hotel size={14} className="text-brand" aria-hidden="true" /> Where to stay</h3>
                {stay.note && <p className="mt-2 text-[12.5px] text-[#B45309]">{stay.note}</p>}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {stay.options.map((o) => (
                    <li key={o.name} className="flex items-center justify-between gap-2 text-[13.5px]">
                      <span className="text-ink-700">{o.name}</span>
                      <span className="shrink-0 font-semibold text-ink">{o.from === 0 ? 'Operator' : `${pkr(o.from)}–${pkr(o.to).replace('PKR ', '')}`}</span>
                    </li>
                  ))}
                </ul>
                <a href={stay.search} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"><ExternalLink size={12} aria-hidden="true" /> Check live prices &amp; book</a>
                <p className="mt-1 text-[11px] text-ink-400">Indicative PKR/night ranges — confirm when booking.</p>
              </div>
            )}

            {d.nearby.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-500">Combine with</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.nearby.map((id) => (
                    <button key={id} type="button" onClick={() => openDestination(id)} className="h-10 rounded-full border border-line px-4 text-[14px] font-medium text-ink hover:border-brand-300 hover:text-brand">
                      {destinationById[id].name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {credit?.href && (
              <a href={credit.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-400 hover:text-ink-600">
                <ExternalLink size={12} aria-hidden="true" /> {credit.label} — author & licence
              </a>
            )}
          </div>
        </div>

        {embed && (
          <div className="px-6 pb-6 sm:px-8 sm:pb-8">
            <div className="overflow-hidden rounded-2xl border border-line">
              <iframe title={`Map of ${d.name}`} src={embed} loading="lazy" className="h-[260px] w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
