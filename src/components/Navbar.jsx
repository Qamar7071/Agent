import { useEffect, useState } from 'react';
import { Menu, X, Send, Search, Heart, Sparkles } from 'lucide-react';
import Logo from './ui/Logo.jsx';
import { useApp } from '../context/AppContext.jsx';
import { scrollToId } from '../lib/format.js';

const links = [
  { id: 'top', label: 'Home' },
  { id: 'destinations', label: 'Destinations' },
  { id: 'plan', label: 'Plan Trip' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'safety', label: 'Travel Safely' },
];

export default function Navbar() {
  const { openAssistant, openPlanner, saved, showSaved } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('top');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      let current = 'top';
      for (const l of links) {
        const el = document.getElementById(l.id);
        if (el && el.getBoundingClientRect().top < 140) current = l.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id) => (e) => {
    e.preventDefault();
    setOpen(false);
    scrollToId(id);
  };

  const focusSearch = () => {
    scrollToId('top');
    setTimeout(() => document.getElementById('hero-where')?.focus(), 350);
  };

  const iconBtn = 'relative inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10';

  return (
    <header className={`on-dark fixed inset-x-0 top-0 z-40 border-b transition-all duration-300 ${scrolled || open ? 'border-white/10 bg-night/95 shadow-lg backdrop-blur-xl' : 'border-white/15 bg-night/35 backdrop-blur-md'}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-6 px-5 sm:px-8">
        <a href="#top" onClick={go('top')} className="rounded-xl" aria-label="Raahi AI — home">
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              onClick={go(l.id)}
              aria-current={active === l.id ? 'true' : undefined}
              className={`relative px-4 py-2 text-[15px] font-medium transition ${active === l.id ? 'text-white' : 'text-white/80 hover:text-white'}`}
            >
              {l.label}
              {active === l.id && <span aria-hidden="true" className="absolute inset-x-4 -bottom-[3px] h-[2px] rounded-full bg-white" />}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-1 lg:flex">
          <button type="button" onClick={focusSearch} className={iconBtn} aria-label="Search destinations">
            <Search size={21} />
          </button>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-white/25" />
          <button type="button" onClick={showSaved} className={iconBtn} aria-label={`Saved destinations (${saved.length})`}>
            <Heart size={21} />
            {saved.length > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-400 px-1 text-[10px] font-bold">{saved.length}</span>}
          </button>
          <button type="button" onClick={openAssistant} className={iconBtn} aria-label="Ask Raahi AI">
            <Sparkles size={20} />
          </button>
          <button type="button" onClick={() => openPlanner()} className="ml-3 inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white shadow-brand transition hover:bg-brand-600">
            <Send size={16} aria-hidden="true" /> Start Planning
          </button>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-white lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-white/10 px-5 pb-6 pt-2 lg:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {links.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={go(l.id)} className="border-b border-white/10 py-4 text-[17px] font-medium text-white">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { setOpen(false); openAssistant(); }} className="h-12 rounded-xl border border-white/25 font-semibold text-white">
              Ask Raahi
            </button>
            <button type="button" onClick={() => { setOpen(false); openPlanner(); }} className="h-12 rounded-xl bg-brand font-semibold text-white">
              Start Planning
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
