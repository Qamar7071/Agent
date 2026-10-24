import { ArrowRight, Sparkles } from 'lucide-react';
import { ctaSources } from '../../lib/images.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';

export default function FinalCTA() {
  const { openAssistant, openPlanner } = useApp();
  return (
    <section id="cta" aria-labelledby="cta-title" className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="on-dark relative isolate mx-auto flex min-h-[440px] max-w-[1400px] items-center overflow-hidden rounded-[32px] shadow-lift">
        <SmartImage sources={ctaSources()} alt="K2 rising above the Baltoro Glacier in the Karakoram" tone={['#203448', '#5FB4FF']} className="!absolute inset-0 -z-10" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(7,22,41,0.85)_0%,rgba(7,22,41,0.55)_45%,rgba(7,22,41,0.1)_100%)]" />
        <div className="flex max-w-2xl flex-col gap-6 p-8 sm:p-14">
          <p className="font-script text-[30px] font-bold text-glacier-300">Better plans, bigger adventures</p>
          <h2 id="cta-title" className="font-display text-[clamp(2.1rem,4.6vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-white">
            The mountains are waiting. Your plan is one message away.
          </h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => openPlanner()} className="inline-flex h-14 items-center gap-2 rounded-full bg-brand px-7 font-semibold text-white shadow-brand hover:bg-brand-600">
              Plan My Journey <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={openAssistant} className="inline-flex h-14 items-center gap-2 rounded-full border border-white/50 bg-white/10 px-7 font-semibold text-white backdrop-blur-md hover:bg-white hover:text-ink">
              <Sparkles size={18} aria-hidden="true" /> Talk to Raahi
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
