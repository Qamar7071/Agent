// Home: "Where can we go?" Pick a budget and a length; the server's planner builds every trip
// it knows for two people next month and the best three are shown. Real estimates, loaded only
// when the section comes into view, and honestly labelled.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Compass, Route, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { MONTHS, pkr, plural } from '../../lib/format.js';
import Photo from '../ui/Photo.jsx';
import DataBadge from '../ui/DataBadge.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

const BUDGETS = [[100000, 'Rs 1 lakh'], [200000, 'Rs 2 lakh'], [350000, 'Rs 3.5 lakh']];
const DAYS = [4, 6, 8];
const PEOPLE = 2;
const nextMonth = () => ((new Date().getMonth() + 1) % 12) + 1;

function useInView(ref) {
  const [seen, setSeen] = useState(() => typeof window !== 'undefined' && !('IntersectionObserver' in window));
  useEffect(() => {
    if (seen || !ref.current) return undefined;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, ref]);
  return seen;
}

function Idea({ idea }) {
  const fits = idea.fits_budget && idea.fits_days && idea.season.verdict !== 'closed';
  return (
    <li className="card card-hover flex flex-col overflow-hidden">
      <div className="relative aspect-[16/10]">
        <Photo id={idea.photo} sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw" alt="" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {fits && <span className="rounded-full bg-juniper px-2.5 py-1 text-xs font-semibold text-on-juniper">Fits</span>}
          {idea.season.verdict === 'best' && <span className="rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-juniper-700">Good season</span>}
          {idea.season.verdict === 'closed' && <span className="rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-brick">Usually closed then</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="type-semiwide text-lg font-bold leading-snug">{idea.title}</h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <p className="num text-2xl font-extrabold">{pkr(idea.total)}</p>
          <p className="text-sm text-ink-600">for {plural(PEOPLE, 'person', 'people')}</p>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-700"><Route size={14} aria-hidden="true" /> {plural(idea.days, 'day')}, {idea.way}</p>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {idea.good.slice(0, 1).map((g) => <li key={g} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-juniper-600" aria-hidden="true" />{g}</li>)}
          {idea.bad.slice(0, 1).map((b) => <li key={b} className="flex gap-2 text-ink-700"><TriangleAlert size={16} className="mt-0.5 shrink-0 text-ochre" aria-label="Note:" />{b}</li>)}
        </ul>
      </div>
    </li>
  );
}

export default function WhereCanWeGo() {
  const ref = useRef(null);
  const visible = useInView(ref);
  const [budget, setBudget] = useState(200000);
  const [days, setDays] = useState(6);
  const month = useMemo(nextMonth, []);
  const [res, setRes] = useState({ state: 'idle', ideas: [] });

  useEffect(() => {
    if (!visible) return undefined;
    let off = false;
    setRes((r) => ({ ...r, state: 'loading' }));
    api.explore({ origin: 'Islamabad', days, adults: PEOPLE, budget_pkr: budget, budget_basis: 'total', month, limit: 3 })
      .then((d) => !off && setRes({ state: 'ready', ideas: d.ideas || [] }))
      .catch(() => !off && setRes({ state: 'error', ideas: [] }));
    return () => { off = true; };
  }, [visible, budget, days, month]);

  const more = `/explore?${new URLSearchParams({ from: 'Islamabad', days: String(days), people: String(PEOPLE), budget: String(budget), month: String(month) })}`;
  return (
    <section ref={ref} aria-labelledby="wcwg-title" className="border-y border-limestone-300 bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="wcwg-title" eyebrow="Where can we go?" title="Have a budget, not a destination?"
            action={<Link to={more} className="btn-outline"><Compass size={16} aria-hidden="true" /> Open the trip explorer</Link>}>
            Raahi’s planner builds every trip it knows for your group, the most comfortable way that still fits, and ranks
            them with plain reasons. Here: two people from Islamabad in {MONTHS[month - 1]}.
          </SectionHeader>
        </Reveal>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div role="radiogroup" aria-label="Budget for two" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm font-semibold text-ink-700">Budget</span>
            {BUDGETS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={budget === v} className="chip" onClick={() => setBudget(v)}>{l}</button>)}
          </div>
          <div role="radiogroup" aria-label="Trip length" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm font-semibold text-ink-700">Days</span>
            {DAYS.map((v) => <button key={v} type="button" role="radio" aria-checked={days === v} className="chip num" onClick={() => setDays(v)}>{v} days</button>)}
          </div>
          <DataBadge kind="estimate" label="Planner estimates" />
        </div>

        <div className="mt-6" aria-live="polite" aria-busy={res.state === 'loading'}>
          {(res.state === 'idle' || (res.state === 'loading' && !res.ideas.length)) && (
            <ul className="grid gap-5 md:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => <li key={i} className="skeleton h-80 rounded-2xl" />)}
            </ul>
          )}
          {res.state === 'error' && (
            <div className="rounded-2xl border border-dashed border-limestone-400 p-6 text-sm text-ink-700">
              The planner couldn’t be reached just now. <Link to={more} className="link">Open the trip explorer</Link> to try again.
            </div>
          )}
          {res.ideas.length > 0 && (
            <ul className={`grid gap-5 md:grid-cols-3 ${res.state === 'loading' ? 'opacity-60 transition-opacity' : ''}`}>
              {res.ideas.map((idea) => <Idea key={idea.id} idea={idea} />)}
            </ul>
          )}
          {res.state === 'ready' && (
            <p className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-600">
              <span>Costs are Raahi’s estimates for two people, not quotes. Seasons are typical patterns, not forecasts.</span>
              <Link to={more} className="link inline-flex items-center gap-1 text-sm">See every trip for your group <ArrowRight size={14} aria-hidden="true" /></Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
