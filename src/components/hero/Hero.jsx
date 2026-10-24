import { Compass } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import SearchBar from './SearchBar.jsx';
import AssistantPanel from '../assistant/AssistantPanel.jsx';
import { heroSources, hasLocalPhoto } from '../../lib/images.js';
import { heroCaption } from '../../data/destinations.js';
import { useApp } from '../../context/AppContext.jsx';
import { scrollToId } from '../../lib/format.js';

const popular = [
  { id: 'skardu', label: 'Skardu' },
  { id: 'hunza', label: 'Hunza' },
  { id: 'fairy-meadows', label: 'Fairy Meadows' },
  { id: 'deosai', label: 'Deosai' },
];

export default function Hero() {
  const { openDestination } = useApp();

  return (
    <section id="top" aria-labelledby="hero-title" className="on-dark relative isolate overflow-hidden bg-night">
      <SmartImage
        sources={heroSources()}
        alt="Turquoise Attabad Lake surrounded by snow-capped Karakoram peaks in Upper Hunza"
        eager
        tone={['#1D4D6E', '#2FB7C4']}
        className="!absolute inset-0 -z-10"
        imgClassName="motion-safe:animate-kenburns"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(7,22,41,0.82)_0%,rgba(7,22,41,0.55)_34%,rgba(7,22,41,0.12)_62%,rgba(7,22,41,0.05)_100%)]" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-36 bg-gradient-to-b from-night/60 to-transparent" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-night/45 to-transparent" />

      <div className="relative mx-auto grid max-w-[1400px] gap-8 px-5 pb-14 pt-[108px] sm:px-8 lg:grid-cols-[minmax(0,1fr)_410px] lg:gap-x-10 lg:gap-y-7 lg:pt-[112px]">
        <div className="relative order-1 flex flex-col gap-6 lg:pt-6">
          <p className="flex flex-wrap items-center gap-x-3 text-[13.5px] font-semibold uppercase tracking-[0.26em] text-white/90 motion-safe:animate-rise">
            Explore <span aria-hidden="true" className="text-brand-300">•</span> Discover <span aria-hidden="true" className="text-brand-300">•</span> Experience
          </p>

          <h1 id="hero-title" className="max-w-[660px] font-display text-[clamp(2.6rem,5.4vw,4.75rem)] font-bold leading-[1.02] tracking-[-0.02em] text-white [text-shadow:0_2px_24px_rgba(7,22,41,0.35)] motion-safe:animate-rise [animation-delay:80ms]">
            Your Next Adventure, Powered by <span className="text-brand-400">AI</span>
          </h1>

          <p className="max-w-[580px] text-[clamp(1.02rem,1.3vw,1.18rem)] font-medium leading-relaxed text-white/90 motion-safe:animate-rise [animation-delay:140ms]">
            Let Raahi plan your perfect trip across Northern Pakistan — personalised itineraries for Skardu, Hunza, Fairy Meadows and Deosai, built around real roads, seasons and your budget.
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 motion-safe:animate-rise [animation-delay:200ms]">
            <button type="button" onClick={() => scrollToId('destinations')} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/50 bg-white/10 px-6 text-[15px] font-semibold text-white backdrop-blur-md transition hover:bg-white hover:text-ink">
              <Compass size={18} aria-hidden="true" /> Explore Northern Pakistan
            </button>
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-white/85">
              <span className="font-medium">Popular:</span>
              {popular.map((p) => (
                <button key={p.id} type="button" onClick={() => openDestination(p.id)} className="rounded-full bg-white/15 px-3 py-1.5 font-medium text-white backdrop-blur transition hover:bg-white/30">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <p aria-hidden="true" className="pointer-events-none absolute right-0 top-10 hidden rotate-[-9deg] text-right font-script text-[34px] font-bold leading-[1.05] text-white [text-shadow:0_2px_12px_rgba(7,22,41,0.45)] 2xl:block">
            Better Plans,
            <br />
            Bigger Adventures
            <svg width="60" height="64" viewBox="0 0 60 64" fill="none" className="ml-auto mr-10 mt-1">
              <path d="M8 4 C 2 24, 14 44, 40 54" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M30 56 L41 55 L36 45" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </p>
        </div>

        <div id="hero-assistant" className="order-3 motion-safe:animate-rise [animation-delay:240ms] lg:order-2 lg:row-span-2">
          <AssistantPanel variant="hero" />
        </div>

        <div className="order-2 self-end motion-safe:animate-rise [animation-delay:200ms] lg:order-3">
          <SearchBar />
        </div>
      </div>

      <p className="absolute bottom-3 right-5 text-[11px] font-medium text-white/70 sm:right-8">
        {hasLocalPhoto('hero') ? 'Gilgit-Baltistan, Pakistan' : `${heroCaption} · Photo via Wikimedia Commons`}
      </p>
    </section>
  );
}
