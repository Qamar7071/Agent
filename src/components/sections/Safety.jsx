import { Mountain, Route, Plane, Wallet, Signal, HeartHandshake, ExternalLink, Phone, ShieldCheck } from 'lucide-react';
import { emergencyNumbers, officialSources, safetyTips } from '../../data/content.js';
import SectionHeading from '../ui/SectionHeading.jsx';
import Reveal from '../ui/Reveal.jsx';

const icons = { Mountain, Route, Plane, Wallet, Signal, HeartHandshake };
const tones = ['text-brand bg-brand-50', 'text-sun bg-sun-50', 'text-teal-600 bg-teal-50', 'text-leaf bg-leaf-50', 'text-[#7C3AED] bg-[#F3EEFF]', 'text-rose bg-rose-50'];

export default function Safety() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="bg-surface py-16 sm:py-24">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-5 sm:px-8">
        <SectionHeading id="safety-title" eyebrow="Travel Information & Safety" title="Mountains reward" accent="the prepared">
          The North is welcoming for travellers who respect its altitude, roads and weather. The essentials:
        </SectionHeading>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {safetyTips.map((t, i) => {
            const Icon = icons[t.icon];
            return (
              <Reveal key={t.title} delay={(i % 3) * 70} className="h-full">
                <article className="flex h-full flex-col gap-3 rounded-[20px] border border-line bg-white p-6 shadow-sm">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full ${tones[i]}`}><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="font-display text-[19px] font-semibold text-ink">{t.title}</h3>
                  <p className="text-[14.5px] leading-relaxed text-ink-600">{t.text}</p>
                </article>
              </Reveal>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="rounded-[20px] border border-line bg-white p-7 shadow-sm">
            <p className="flex items-center gap-2 font-display text-[19px] font-semibold text-ink"><ShieldCheck size={20} className="text-brand" aria-hidden="true" /> Check live conditions at the source</p>
            <p className="mt-1.5 text-[14.5px] text-ink-600">Raahi never guesses road status or weather. Before each travel day, check:</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {officialSources.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col rounded-2xl border border-line p-4 transition hover:border-brand-300 hover:bg-brand-50">
                    <span className="flex items-center justify-between gap-2 text-[14.5px] font-semibold text-ink">{s.label}<ExternalLink size={14} className="shrink-0 text-ink-400 group-hover:text-brand" aria-hidden="true" /></span>
                    <span className="mt-1 text-[13px] text-ink-500">{s.note}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-5 rounded-[20px] bg-night p-7 text-white">
            <p className="flex items-center gap-2 font-display text-[19px] font-semibold"><Phone size={19} className="text-glacier" aria-hidden="true" /> Emergency numbers</p>
            <ul className="on-dark flex flex-col gap-3">
              {emergencyNumbers.map((e) => (
                <li key={e.number}>
                  <a href={`tel:${e.number}`} className="flex items-center justify-between rounded-2xl bg-white/10 px-5 py-4 transition hover:bg-white/15">
                    <span className="text-[15px] font-medium text-white/80">{e.label}</span>
                    <span className="font-display text-[26px] font-bold">{e.number}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-white/65">Save your hotel’s and driver’s numbers too — coverage can drop between valleys.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
