import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import Logo from '../ui/Logo.jsx';
import { Link, useRouter } from '../../lib/router.jsx';

const links = [
  { to: '/#destinations', label: 'Destinations' },
  { to: '/#conditions', label: 'Weather & roads' },
  { to: '/#how', label: 'How it works' },
  { to: '/trips', label: 'My trips' },
];

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

  const solid = !overHero || scrolled || open;
  return (
    <header className={`on-dark fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${solid ? 'bg-juniper shadow-[0_1px_0_rgba(255,255,255,0.08)]' : 'bg-gradient-to-b from-juniper-950/70 to-transparent'}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-6 px-4 sm:px-6">
        <Link to="/" className="rounded" aria-label="Raahi home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} aria-current={path === l.to ? 'page' : undefined}
              className="rounded px-3 py-2 text-[15px] font-medium text-white/85 hover:text-white aria-[current=page]:text-white aria-[current=page]:underline aria-[current=page]:decoration-apricot aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8">
              {l.label}
            </Link>
          ))}
          <Link to="/plan" className="btn ml-3 bg-apricot px-5 text-juniper-950 hover:bg-apricot-300">
            Plan a trip
          </Link>
        </nav>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded text-white md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="border-t border-white/10 bg-juniper px-4 pb-5 md:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="block border-b border-white/10 py-3.5 text-[17px] font-medium text-white">
              {l.label}
            </Link>
          ))}
          <Link to="/plan" className="btn mt-4 w-full bg-apricot text-juniper-950">Plan a trip</Link>
        </nav>
      )}
    </header>
  );
}
