// Home: the closing call to action, and how help with arranging a trip works (an enquiry, never
// a booking).
import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { usePlanner } from '../../context/PlannerContext.jsx';
import Photo from '../ui/Photo.jsx';
import Reveal from '../ui/Reveal.jsx';
import { creditLine, photos } from '../../data/photos.js';

export default function EnquiryCta() {
  const { health } = usePlanner();
  const closed = health && !health.enquiries_open;
  return (
    <section aria-labelledby="cta-title" className="on-dark relative isolate overflow-hidden bg-juniper-950 text-white">
      <div className="absolute inset-0 -z-20"><Photo id="fairy-meadows" sizes="100vw" position="50% 40%" /></div>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(13,33,25,0.94)_0%,rgba(13,33,25,0.82)_50%,rgba(13,33,25,0.45)_100%)]" />
      <div className="mx-auto grid max-w-page gap-10 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <Reveal>
          <p className="eyebrow">Ready when you are</p>
          <h2 id="cta-title" className="type-wide mt-3 max-w-[16ch] text-[clamp(2rem,4.6vw,3.6rem)] font-extrabold leading-[1.05]">The mountains are waiting. Your plan is a message away.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/plan" className="btn-accent h-[52px] px-6 text-base"><Sparkles size={18} aria-hidden="true" /> Plan my trip</Link>
            <Link to="/explore" className="btn-ghost h-[52px] px-6 text-base"><Compass size={18} aria-hidden="true" /> Where can we go?</Link>
          </div>
        </Reveal>
        <Reveal delay={100} className="glass rounded-3xl p-5 sm:p-6">
          <h3 className="text-lg font-bold">Want help arranging it?</h3>
          <p className="mt-2 text-sm text-white/85">
            When the plan looks right, send it from the planner as an enquiry. A person reads every enquiry and replies by
            email, phone or WhatsApp, whichever you choose.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-white/85">
            <li className="flex gap-2"><ArrowRight size={14} className="mt-1 shrink-0 text-apricot-300" aria-hidden="true" />An enquiry is not a booking. Nothing is reserved or paid until you agree it directly.</li>
            <li className="flex gap-2"><ArrowRight size={14} className="mt-1 shrink-0 text-apricot-300" aria-hidden="true" />You choose what to share, and you can withdraw it at any time.</li>
            <li className="flex gap-2"><ArrowRight size={14} className="mt-1 shrink-0 text-apricot-300" aria-hidden="true" />Prices in your plan are estimates; real quotes come back with the reply.</li>
          </ul>
          {closed && <p className="mt-3 rounded-lg bg-black/25 px-3 py-2 text-xs text-white/85">Enquiries aren’t open on this website yet. You can still plan and save trips.</p>}
        </Reveal>
      </div>
      <p className="absolute bottom-3 right-4 text-[11px] text-white/60">{photos['fairy-meadows'].place}. {creditLine('fairy-meadows')}.</p>
    </section>
  );
}
