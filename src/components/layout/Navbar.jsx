import { useEffect, useState } from 'react';
import { Menu, Monitor, Moon, Sparkles, Sun, X } from 'lucide-react';
import Logo from '../ui/Logo.jsx';
import { Link, useRouter } from '../../lib/router.jsx';
import { useTheme } from '../../lib/theme.js';

const links = [
  { to: '/explore', label: 'Where to go' },
  { to: '/#destinations', label: 'Destinations' },
  { to: '/twin', label: 'Travel Twin' },
  { to: '/agents', label: 'Agents' },
  { to: '/guardian', label: 'Guardian' },
  { to: '/trips', label: 'My trips' },
];
// The phone menu groups the same links by what they are for.
const groups = [
  { label: 'Plan', items: ['/explore', '/#destinations', '/trips'] },
  { label: 'Raahi’s agents', items: ['/agents', '/twin', '/guardian'] },
];
const THEME = {
  system: { icon: Monitor, label: 'Theme: same as your device' },
  light: { icon: Sun, label: 'Theme: light' },
  dark: { icon: Moon, label: 'Theme: dark' },
};

function ThemeButton({ withText = false }) {
  const { choice, next } = useTheme();
  const { icon: Icon, label } = THEME[choice];
  return (
    <button type="button" onClick={next} title={`${label}. Click to change.`} aria-label={`${label}. Change theme`}
      className={`inline-flex h-11 items-center gap-2 rounded-full px-2.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white ${withText ? 'w-full justify-start rounded-xl py-3.5 text-[17px] font-medium text-white' : 'w-11 justify-center'}`}>
      <Icon size={18} aria-hidden="true" />
      {withText && label}
    </button>
  );
}

export default function Navbar() {
  const { path } = useRouter();
  const overHero = path === '/';
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const mission = ['/twin', '/agents', '/guardian'].includes(path);
  const solid = !overHero || scrolled || open;
  const bg = mission ? 'bg-[#070d14]/90 shadow-[0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl'
    : solid ? 'bg-juniper-900/90 shadow-[0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl' : 'bg-gradient-to-b from-juniper-950/70 to-transparent';
  const byTo = Object.fromEntries(links.map((l) => [l.to, l]));
  return (
    <header className={`on-dark fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${bg}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-[#17211C]">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="rounded" aria-label="Raahi home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} aria-current={path === l.to ? 'page' : undefined}
              className="rounded-full px-3 py-2 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/[0.14] aria-[current=page]:text-white">
              {l.label}
            </Link>
          ))}
          <ThemeButton />
          <Link to="/plan" className="btn-accent ml-2 rounded-full px-5">
            <Sparkles size={16} aria-hidden="true" /> Plan a trip
          </Link>
        </nav>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className={`max-h-[calc(100dvh-4rem)] animate-fadeIn overflow-y-auto border-t border-white/10 px-4 pb-6 pt-2 lg:hidden ${mission ? 'bg-[#070d14]' : 'bg-juniper-900'}`}>
          <Link to="/plan" className="btn-accent mt-2 w-full rounded-xl text-base">
            <Sparkles size={18} aria-hidden="true" /> Plan a trip with AI
          </Link>
          {groups.map((g) => (
            <div key={g.label} className="mt-5">
              <p className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-apricot-300">{g.label}</p>
              <ul className="mt-1">
                {g.items.map((to) => (
                  <li key={to}>
                    <Link to={to} aria-current={path === to ? 'page' : undefined}
                      className="block rounded-xl px-1 py-3.5 text-[17px] font-medium text-white hover:bg-white/5 aria-[current=page]:text-apricot-300">
                      {byTo[to].label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-4 border-t border-white/10 pt-2"><ThemeButton withText /></div>
        </nav>
      )}
    </header>
  );
}
