import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Logo from '../ui/Logo.jsx';
import { destinations, heroPhotos } from '../../data/destinations.js';
import { commonsPage, hasLocalPhoto } from '../../lib/images.js';
import { scrollToId } from '../../lib/format.js';

const nav = [
  { id: 'destinations', label: 'Destinations' },
  { id: 'plan', label: 'Trip planner' },
  { id: 'experiences', label: 'Experiences' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'safety', label: 'Travel safely' },
];

export default function Footer() {
  const [credits, setCredits] = useState(false);
  const files = [...new Set([...heroPhotos, ...destinations.filter((d) => !hasLocalPhoto(d.id)).flatMap((d) => d.photos)])];

  return (
    <footer className="on-dark bg-night-900 text-white">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-12 px-5 py-16 sm:px-8">
        <div className="flex flex-col justify-between gap-10 lg:flex-row">
          <div className="flex max-w-sm flex-col gap-4">
            <Logo />
            <p className="text-[15px] leading-relaxed text-snow/60">An AI travel concierge for Gilgit-Baltistan — honest routes, real seasons and the people who know these valleys.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-snow/45">EXPLORE</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {nav.map((n) => (
                  <li key={n.id}>
                    <a href={`#${n.id}`} onClick={(e) => { e.preventDefault(); scrollToId(n.id); }} className="text-[15px] text-snow/80 hover:text-glacier-300">{n.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-snow/45">DESTINATIONS</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {destinations.slice(0, 5).map((d) => (
                  <li key={d.id} className="text-[15px] text-snow/80">{d.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-snow/45">BASED IN</p>
              <p className="mt-4 text-[15px] text-snow/80">Gilgit-Baltistan, Pakistan</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6">
          <button type="button" aria-expanded={credits} aria-controls="photo-credits" onClick={() => setCredits((v) => !v)} className="inline-flex items-center gap-1.5 text-[13px] text-snow/55 hover:text-snow">
            Photo credits <ChevronDown size={14} className={`transition ${credits ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {credits && (
            <ul id="photo-credits" className="mt-3 grid gap-1.5 text-[12.5px] text-snow/50 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((f) => (
                <li key={f}>
                  <a href={commonsPage(f)} target="_blank" rel="noopener noreferrer" className="hover:text-snow/80">{f.replace(/\.(jpe?g|png)$/i, '')} — Wikimedia Commons</a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap justify-between gap-3 text-[13px] text-snow/45">
            <span>© {new Date().getFullYear()} Raahi. Built for travellers to the North.</span>
            <span className="font-mono tracking-wider">35.9°N · 74.3°E</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
