import { Sparkles, HandCoins, Clock3, ShieldCheck, Mountain, CalendarHeart } from 'lucide-react';

const features = [
  { icon: Sparkles, title: 'Personalised Itineraries', text: 'Tailored to your interests and pace', tone: 'text-brand bg-brand-50' },
  { icon: HandCoins, title: 'Budgets in PKR', text: 'Plans sized to what you want to spend', tone: 'text-leaf bg-leaf-50' },
  { icon: Clock3, title: '24/7 AI Planner', text: 'Ask anything, any time of day', tone: 'text-sun bg-sun-50' },
  { icon: ShieldCheck, title: 'Safety First', text: 'Altitude, roads and buffer days built in', tone: 'text-teal-600 bg-teal-50' },
  { icon: Mountain, title: 'Local Knowledge', text: 'Routes along the real roads of the North', tone: 'text-rose bg-rose-50' },
  { icon: CalendarHeart, title: 'Season-Smart', text: 'Go when passes and plateaus are open', tone: 'text-brand-600 bg-brand-50' },
];

export default function FeatureStrip() {
  return (
    <section id="features" aria-label="Why plan with Raahi" className="relative z-10 border-b border-line bg-white">
      <ul className="mx-auto grid max-w-[1400px] grid-cols-2 gap-x-4 gap-y-8 px-5 py-10 sm:grid-cols-3 sm:px-8 lg:grid-cols-6">
        {features.map(({ icon: Icon, title, text, tone }) => (
          <li key={title} className="flex flex-col items-center gap-2.5 text-center">
            <span className={`flex h-14 w-14 items-center justify-center rounded-full ${tone}`}>
              <Icon size={26} strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className="mt-1 text-[15.5px] font-semibold text-ink">{title}</h3>
            <p className="max-w-[190px] text-[13.5px] leading-snug text-ink-500">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
