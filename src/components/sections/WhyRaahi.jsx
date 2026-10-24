import { useState } from 'react';
import { MapPinned, Bot, Mountain, CalendarRange, Lightbulb, ArrowRight } from 'lucide-react';
import { destinations } from '../../data/destinations.js';
import { sourcesFor } from '../../lib/images.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';

const stats = [
  { icon: MapPinned, value: String(destinations.length), label: 'Northern destinations', tone: 'text-brand' },
  { icon: Bot, value: '24/7', label: 'AI trip planner', tone: 'text-brand' },
  { icon: Mountain, value: '4,693 m', label: 'Highest stop: Khunjerab', tone: 'text-sun' },
  { icon: CalendarRange, value: '12', label: 'Month season guide', tone: 'text-leaf' },
];

const tips = [
  { place: 'Skardu', text: 'Flights to Skardu are weather-dependent — keep one spare day before your flight home.' },
  { place: 'Deosai', text: 'Leave Skardu early and come back before dark. Nights on the plateau are cold even in July.' },
  { place: 'Hunza', text: 'Come in April for apricot blossom or late October for golden poplars — both quieter than mid-summer.' },
];

export default function WhyRaahi() {
  const { openPlanner } = useApp();
  const [tip, setTip] = useState(0);

  return (
    <section id="why" aria-labelledby="why-title" className="bg-surface py-16 sm:py-20">
      <div className="mx-auto grid max-w-[1400px] gap-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="relative isolate min-h-[320px] overflow-hidden rounded-[24px] shadow-card">
          <SmartImage sources={sourcesFor('passu', 1000)} alt="Passu Cones above Borith Lake in Upper Hunza" tone={destinations.find((d) => d.id === 'passu').tone} className="!absolute inset-0 -z-10" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-night/55 via-night/10 to-transparent" />
          <p className="p-7 font-script text-[40px] font-bold leading-[1] text-white [text-shadow:0_2px_12px_rgba(7,22,41,0.5)]">
            Your Next
            <br />
            Adventure Awaits
          </p>
          <button type="button" onClick={() => openPlanner({ destinations: ['hunza', 'attabad', 'passu'] })} className="absolute bottom-6 left-7 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-ink shadow hover:bg-brand hover:text-white">
            Plan Upper Hunza <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col justify-center gap-6 py-2">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-500">Why choose us</p>
            <h2 id="why-title" className="mt-2 font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-tight">The Smarter Way to Travel the North</h2>
            <p className="mt-2 max-w-xl text-[15.5px] leading-relaxed text-ink-600">Raahi knows that a Skardu flight can be cancelled, that Deosai only opens in summer and that Khunjerab sits at 4,693 m — and plans around it.</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ icon: Icon, value, label, tone }) => (
              <li key={label} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-4 shadow-sm">
                <Icon size={24} className={tone} aria-hidden="true" />
                <span className="mt-1 font-display text-[22px] font-bold leading-none text-ink">{value}</span>
                <span className="text-[12.5px] leading-snug text-ink-500">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="flex flex-col gap-3 rounded-[24px] border border-line bg-white p-6 shadow-card">
            <p className="flex items-center gap-2 font-display text-[17px] font-semibold"><Lightbulb size={18} className="text-sun" aria-hidden="true" /> Local travel tip</p>
            <div aria-live="polite" className="min-h-[86px]">
              <p className="text-[12.5px] font-semibold uppercase tracking-wider text-brand">{tips[tip].place}</p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-ink-700">{tips[tip].text}</p>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Choose a tip">
              {tips.map((t, i) => (
                <button key={t.place} type="button" onClick={() => setTip(i)} aria-label={`Tip for ${t.place}`} aria-pressed={tip === i} className="flex h-6 w-6 items-center justify-center">
                  <span className={`block h-2 rounded-full transition-all ${tip === i ? 'w-5 bg-brand' : 'w-2 bg-line'}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="relative isolate min-h-[170px] overflow-hidden rounded-[24px] shadow-card">
            <SmartImage sources={sourcesFor('attabad', 800)} alt="Attabad Lake in Gojal" tone={destinations.find((d) => d.id === 'attabad').tone} className="!absolute inset-0 -z-10" />
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-night/60 to-transparent" />
            <p className="absolute bottom-4 left-5 rotate-[-6deg] font-script text-[30px] font-bold text-white [text-shadow:0_2px_10px_rgba(7,22,41,0.5)]">Unforgettable Memories</p>
          </div>
        </div>
      </div>
    </section>
  );
}
