import { ArrowRight } from 'lucide-react';
import { experiences } from '../../data/content.js';
import { destinationById } from '../../data/destinations.js';
import { sourcesFor } from '../../lib/images.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import SectionHeading from '../ui/SectionHeading.jsx';
import Reveal from '../ui/Reveal.jsx';

export default function Experiences() {
  const { openPlanner } = useApp();
  return (
    <section id="experiences" aria-labelledby="exp-title" className="bg-surface py-16 sm:py-24">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-5 sm:px-8">
        <SectionHeading id="exp-title" eyebrow="Personalised Experiences" title="Travel the North" accent="your way">
          Choose a travel style and Raahi pre-fills the planner with the right places, pace and interests.
        </SectionHeading>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {experiences.map((x, i) => {
            const d = destinationById[x.photo];
            return (
              <Reveal key={x.id} delay={i * 70} className="h-full">
                <article className="group relative isolate flex h-full min-h-[420px] flex-col justify-end overflow-hidden rounded-[24px] shadow-card">
                  <SmartImage sources={sourcesFor(x.photo, 800)} alt={d.name} tone={d.tone} className="!absolute inset-0 -z-10" imgClassName="transition-transform duration-700 group-hover:scale-105" />
                  <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-night via-night/55 to-transparent" />
                  <div className="flex flex-col gap-3 p-6 text-white">
                    <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold backdrop-blur">{x.days} days suggested</span>
                    <h3 className="font-display text-[24px] font-semibold leading-tight">{x.title}</h3>
                    <p className="text-[14.5px] leading-relaxed text-white/85">{x.text}</p>
                    <button
                      type="button"
                      onClick={() => openPlanner({ destinations: x.destinations, interests: x.interests, days: x.days })}
                      className="mt-1 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-ink transition hover:bg-brand hover:text-white"
                    >
                      Plan this style <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
