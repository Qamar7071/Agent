import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Photo from '../ui/Photo.jsx';
import RouteProfile from './RouteProfile.jsx';
import { creditLine, photos } from '../../data/photos.js';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { useRouter } from '../../lib/router.jsx';

const examples = [
  '6 days in Hunza from Lahore in April, 2 of us, Rs 1,50,000',
  'Skardu and Deosai in July with my family',
  'Fairy Meadows next month, budget 80k per person',
];

export default function Hero() {
  const { send } = usePlanner();
  const { navigate } = useRouter();
  const [text, setText] = useState('');

  const go = (message) => {
    navigate('/plan');
    if (message.trim()) send(message);
  };

  return (
    <section aria-labelledby="hero-title" className="on-dark relative isolate overflow-hidden bg-juniper-950 text-white">
      <div className="absolute inset-0 -z-20">
        <Photo id="passu" priority sizes="100vw" position="50% 62%" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(13,33,25,0.92)_0%,rgba(13,33,25,0.72)_42%,rgba(13,33,25,0.25)_75%,rgba(13,33,25,0.35)_100%)]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-juniper-950/95 to-transparent" />

      <div className="mx-auto flex min-h-[92svh] max-w-page flex-col justify-end px-4 pb-8 pt-28 sm:px-6 lg:min-h-[100svh]">
        <h1 id="hero-title" className="type-wide max-w-[15ch] text-[clamp(2.5rem,6.2vw,4.75rem)] font-extrabold leading-[1.02]">
          Trips north, planned around the real road.
        </h1>
        <p className="mt-5 max-w-[54ch] text-lg text-white/90">
          Tell Raahi where you want to go. It works out the drive days and overnight stops, checks the season and the
          forecast for your dates, and estimates the cost in rupees.
        </p>

        <form
          className="mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            go(text);
          }}
        >
          <label htmlFor="hero-ask" className="sr-only">Describe your trip</label>
          <input
            id="hero-ask"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Where, when, how many of you, budget…"
            className="field h-[52px] flex-1 border-transparent text-ink"
            autoComplete="off"
          />
          <button type="submit" className="btn h-[52px] shrink-0 bg-apricot px-6 text-base text-juniper-950 hover:bg-apricot-300">
            <Sparkles size={18} aria-hidden="true" /> Plan My Trip with AI
          </button>
        </form>
        <div className="mt-3 flex max-w-3xl flex-wrap items-center gap-2 text-sm text-white/85">
          <span>Or try:</span>
          {examples.map((ex) => (
            <button key={ex} type="button" onClick={() => go(ex)} className="rounded-full border border-white/35 px-3 py-1.5 text-left text-white hover:border-white hover:bg-white/10">
              {ex}
            </button>
          ))}
        </div>

        <RouteProfile />
        <p className="mt-6 text-xs text-white/70">{photos.passu.place}. {creditLine('passu')}.</p>
      </div>
    </section>
  );
}
