// Home: "Plan your journey". Four steps on one side; on the other, an example of asking in
// Roman Urdu, written from Raahi's own planner rules (labelled as an example).
import { CalendarCheck2, MessageCircleMore, Route, SlidersHorizontal } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

const steps = [
  { icon: MessageCircleMore, title: 'Describe the trip', text: 'Where, how many days, who is coming, roughly when and what you want to spend. Type it like a message to a friend, speak it, or fill in the trip form.' },
  { icon: Route, title: 'Raahi works it out', text: 'Stops in road order with overnight halts and spare days, departure times from daylight, the season for your month and the forecast for your dates.' },
  { icon: CalendarCheck2, title: 'Get a day-by-day plan', text: 'Drive times, where you sleep, what to do if the weather turns, a cost estimate with every assumption shown, a map and a packing list.' },
  { icon: SlidersHorizontal, title: 'Adjust, share and go', text: 'Change anything by asking ("ek din kam karo", "add Deosai"). Save it, plan it with your group, share it with family, then take Safar Saathi on the road.' },
];

export default function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-page gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div>
          <Reveal>
            <SectionHeader id="how-title" eyebrow="Plan your journey" title="Ask in your own words">
              English or Roman Urdu, typed or spoken. Raahi asks only what it needs, then uses its tools: the road network,
              the season calendar, the forecast, official alerts and the cost model.
            </SectionHeader>
          </Reveal>
          <ol className="mt-10 flex flex-col">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal as="li" key={s.title} delay={i * 80} className="relative flex gap-4 pb-8 last:pb-0">
                  {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-[21px] top-12 h-[calc(100%-3rem)] w-px bg-gradient-to-b from-juniper-200 to-transparent" />}
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-juniper text-on-juniper shadow-card" aria-hidden="true"><Icon size={20} /></span>
                  <div className="min-w-0 pt-1">
                    <h3 className="text-lg font-bold"><span className="num mr-2 text-apricot">{i + 1}</span>{s.title}</h3>
                    <p className="mt-1 max-w-prose text-ink-600">{s.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </ol>
          <div className="mt-10 flex flex-wrap gap-2">
            <Link to="/plan" className="btn-primary px-6">Open the planner</Link>
            <Link to="/explore" className="btn-outline px-6">Not sure where? Start from your budget</Link>
          </div>
        </div>

        <Reveal as="figure" delay={120} className="self-start lg:sticky lg:top-24">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-limestone-300 bg-limestone/60 px-5 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-juniper text-sm font-extrabold text-on-juniper" aria-hidden="true">R</span>
              <div>
                <p className="text-sm font-bold">Raahi</p>
                <p className="text-xs text-ink-600">Example conversation, from Raahi’s own planner rules</p>
              </div>
            </div>
            <div className="flex flex-col gap-4 p-5 text-[15px] sm:p-6">
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-juniper px-4 py-2.5 text-on-juniper">
                Hunza jana hai 6 din ke liye, Lahore se. Hum 2 log hain, budget 1.5 lakh.
              </p>
              <ol className="flex flex-col gap-1.5 rounded-xl border border-limestone-300 bg-limestone/50 px-3 py-2.5 text-sm text-ink-700" aria-label="What Raahi checked">
                <li className="flex gap-2"><span className="num font-semibold text-juniper-600">1</span> Route: Lahore, Islamabad, Chilas, Karimabad</li>
                <li className="flex gap-2"><span className="num font-semibold text-juniper-600">2</span> Drive days: 3 each way by road</li>
                <li className="flex gap-2"><span className="num font-semibold text-juniper-600">3</span> Cost model: road and flight options</li>
              </ol>
              <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-limestone-300 bg-paper px-4 py-3 text-ink-700">
                <p>
                  6 din road se kam hain: Lahore se Islamabad aur Chilas ke raste lag bhag teen din jaane mein lagte hain, to Hunza
                  mein ek din ke liye bhi kam se kam saat din chahiye.
                </p>
                <p className="mt-2">
                  Gilgit flight se jaayein to Hunza mein teen poore din milte hain, aur flight late ho to ek spare din. Dono options
                  do logon ke liye Rs 1,50,000 se zyada hain; Budget tab mein bachat ke tareeqe hain. Flight wala plan bana doon?
                </p>
              </div>
              <div className="flex flex-wrap gap-2" aria-hidden="true">
                {['Haan, flight wala', 'Make it cheaper', '7 din kar do'].map((t) => (
                  <span key={t} className="rounded-full border border-limestone-400 bg-paper px-3 py-1 text-sm text-ink-700">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
