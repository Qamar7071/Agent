// "Where can we go?": the group's budget, days and month in; the trips that fit out. Each card
// is a real plan built by the server's planner, so "Plan this trip" opens exactly that plan.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Compass, Minus, Mountain, Plus, Route } from 'lucide-react';
import { api } from '../lib/api.js';
import { Link, useRouter } from '../lib/router.jsx';
import { usePageMeta } from '../lib/seo.js';
import { byId, origins } from '../lib/data.js';
import { MONTHS, MONTHS_SHORT, metres, pkr, plural } from '../lib/format.js';
import { read, write } from '../lib/store.js';
import { usePlanner } from '../context/PlannerContext.jsx';
import Photo from '../components/ui/Photo.jsx';
import Notice from '../components/ui/Notice.jsx';

const KEY = 'raahi:explore:v1';
const INTERESTS = [['lakes', 'Lakes'], ['mountains', 'Mountains'], ['culture', 'Forts and culture'], ['trekking', 'Trekking'],
  ['photography', 'Photography'], ['relaxation', 'Peace and quiet']];
const STYLES = [['any', 'Any'], ['easy', 'Easy and gentle'], ['adventure', 'Adventure']];
const nextMonth = () => ((new Date().getMonth() + 1) % 12) + 1;

const DEFAULTS = { origin: 'Islamabad', days: 6, adults: 2, children: 0, budget: '', basis: 'total', month: nextMonth(), interests: [], style: 'any' };

function fromQuery(q) {
  const n = (k, lo, hi) => {
    const v = Number(q.get(k));
    return Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;
  };
  const out = {};
  if (q.get('from') && origins.includes(q.get('from'))) out.origin = q.get('from');
  if (n('days', 2, 30)) out.days = n('days', 2, 30);
  if (n('people', 1, 20)) out.adults = n('people', 1, 20);
  if (n('budget', 1000, 20000000)) out.budget = String(n('budget', 1000, 20000000));
  if (q.get('month') === 'any') out.month = null;
  else if (n('month', 1, 12)) out.month = n('month', 1, 12);
  return out;
}

function Stepper({ id, label, value, min, max, onChange, hint }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-outline h-11 w-11 shrink-0 p-0" aria-label={`Fewer: ${label}`} disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}><Minus size={16} aria-hidden="true" /></button>
        <input id={id} className="field num h-11 w-16 text-center" inputMode="numeric" value={value}
          onChange={(e) => {
            const v = Number(e.target.value.replace(/\D/g, ''));
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v || min)));
          }} />
        <button type="button" className="btn-outline h-11 w-11 shrink-0 p-0" aria-label={`More: ${label}`} disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}><Plus size={16} aria-hidden="true" /></button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function BudgetMeter({ total, budget }) {
  if (!budget) return null;
  const pct = Math.min(100, Math.round((total / budget) * 100));
  const over = total > budget;
  return (
    <div className="mt-3" role="img" aria-label={`${pct}% of your budget${over ? ', over budget' : ''}`}>
      <div className="h-2 overflow-hidden rounded-full bg-limestone-300">
        <div className={`h-full rounded-full ${over ? 'bg-ochre' : 'bg-juniper-600'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-600">
        {over ? `${pkr(total - budget)} over your ${pkr(budget)}` : `${pkr(budget - total)} left of your ${pkr(budget)}`}
      </p>
    </div>
  );
}

function IdeaCard({ idea, rank, budgetTotal, onPlan, busy }) {
  const fits = idea.fits_budget && idea.fits_days && idea.season.verdict !== 'closed';
  const people = idea.request.adults + idea.request.children;
  return (
    <li className={`flex flex-col overflow-hidden rounded-lg border bg-paper ${rank === 0 && fits ? 'border-juniper-500 shadow-[0_18px_40px_-28px_rgba(13,33,25,0.6)]' : 'border-limestone-300'}`}>
      <div className="relative aspect-[16/9]">
        <Photo id={idea.photo} sizes="(min-width: 1024px) 560px, 92vw" alt="" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {rank === 0 && fits && <span className="rounded-full bg-juniper px-2.5 py-1 text-xs font-semibold text-on-juniper">Best fit</span>}
          {idea.season.verdict === 'best' && <span className="rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-juniper-700">Good season</span>}
          {idea.season.verdict === 'closed' && <span className="rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-brick">Usually closed then</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="type-semiwide text-lg font-bold leading-snug">{idea.title}</h3>
        <p className="text-sm text-ink-600">{idea.tagline}</p>
        <p className="num mt-3 text-2xl font-extrabold">{pkr(idea.total)}</p>
        <p className="text-sm text-ink-600">
          for {plural(people, 'person', 'people')}, about <span className="num">{pkr(idea.per_person)}</span> each. Estimate, not a quote.
        </p>
        <BudgetMeter total={idea.total} budget={budgetTotal} />
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700">
          <li className="flex items-center gap-1.5"><Route size={15} aria-hidden="true" /> {plural(idea.days, 'day')}, {idea.travel_days} on the road</li>
          <li>{idea.way}</li>
          {idea.max_altitude_m > 0 && <li className="flex items-center gap-1.5"><Mountain size={15} aria-hidden="true" /> up to {metres(idea.max_altitude_m)}</li>}
        </ul>
        {(idea.good.length > 0 || idea.bad.length > 0) && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {idea.good.map((g) => <li key={g} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-juniper-600" aria-hidden="true" /> {g}</li>)}
            {idea.bad.map((b) => <li key={b} className="flex gap-2 text-ink-700"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-ochre" aria-label="Note:" /> {b}</li>)}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
          <button type="button" className="btn-primary min-h-[48px]" disabled={busy} onClick={() => onPlan(idea)}>Plan this trip</button>
          {idea.destinations.slice(0, 2).map((d) => (
            <Link key={d} to={`/destinations/${d}`} className="link text-sm">About {byId[d]?.name || d}</Link>
          ))}
        </div>
      </div>
    </li>
  );
}

export default function Explore() {
  usePageMeta({
    title: 'Where can we go?',
    description: 'Tell Raahi your budget, days and group: it plans every trip north it knows and shows which ones fit, with honest estimates.',
    path: '/explore',
  });
  const { query, navigate } = useRouter();
  const planner = usePlanner();
  const [q, setQ] = useState(() => ({ ...DEFAULTS, ...read(KEY, {}), ...fromQuery(query) }));
  const [res, setRes] = useState({ state: 'loading', data: null, error: null });
  const [planning, setPlanning] = useState(null);
  const [planErr, setPlanErr] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const seq = useRef(0);
  const set = (patch) => setQ((prev) => ({ ...prev, ...patch }));
  const people = q.adults + q.children;
  const budgetNum = Number(String(q.budget).replace(/[^\d]/g, '')) || null;
  const budgetTotal = budgetNum ? (q.basis === 'per_person' ? budgetNum * people : budgetNum) : null;

  const body = useMemo(() => ({
    origin: q.origin, days: q.days, adults: q.adults, children: q.children, budget_pkr: budgetNum,
    budget_basis: q.basis, month: q.month, interests: q.interests, style: q.style, limit: 12,
  }), [q, budgetNum]);

  // Search again shortly after each change, and keep the choices for the next visit.
  useEffect(() => {
    write(KEY, q);
    const id = ++seq.current;
    setRes((r) => ({ ...r, state: 'loading' }));
    const t = setTimeout(() => {
      api.explore(body).then((data) => id === seq.current && setRes({ state: 'ready', data, error: null }))
        .catch((error) => id === seq.current && setRes({ state: 'error', data: null, error }));
    }, 350);
    return () => clearTimeout(t);
  }, [body]);

  const plan = async (idea) => {
    setPlanning(idea.id);
    setPlanErr(null);
    const it = await planner.buildPlan(idea.request, 'the trip explorer');
    setPlanning(null);
    if (it) navigate('/plan');
    else setPlanErr('That plan could not be opened. Try again in a moment.');
  };

  const ideas = res.data?.ideas || [];
  const shown = showAll ? ideas : ideas.slice(0, 6);
  const fitting = ideas.filter((i) => i.fits_budget && i.fits_days && i.season.verdict !== 'closed').length;

  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] w-full max-w-page px-4 pb-20 pt-8 sm:px-6">
      <h1 className="type-wide text-3xl font-extrabold sm:text-5xl">Where can we go?</h1>
      <p className="mt-2 max-w-prose text-ink-600">
        Tell Raahi your budget, days and group. It plans every trip north it knows, the cheapest comfortable way, and
        shows which ones fit.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[340px_1fr]">
        <form className="panel flex h-max flex-col gap-5 p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-label="Your trip">
          <div>
            <label htmlFor="ex-from" className="field-label">Starting from</label>
            <select id="ex-from" className="field h-11" value={q.origin} onChange={(e) => set({ origin: e.target.value })}>
              {origins.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stepper id="ex-days" label="Days" value={q.days} min={2} max={30} onChange={(v) => set({ days: v })} hint="including travel" />
            <Stepper id="ex-adults" label="Adults" value={q.adults} min={1} max={20} onChange={(v) => set({ adults: v })} />
          </div>
          <div>
            <label htmlFor="ex-budget" className="field-label">Budget in rupees (optional)</label>
            <input id="ex-budget" className="field num h-11" inputMode="numeric" placeholder="e.g. 150000" value={q.budget}
              onChange={(e) => set({ budget: e.target.value.replace(/[^\d]/g, '').slice(0, 8) })} />
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Budget is">
              {[['total', 'For everyone'], ['per_person', 'Per person']].map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={q.basis === v} className="chip min-h-[40px]" onClick={() => set({ basis: v })}>{l}</button>
              ))}
            </div>
            {budgetTotal && <p className="mt-1 text-xs text-ink-600">{pkr(budgetTotal)} for {plural(people, 'person', 'people')}</p>}
          </div>
          <fieldset>
            <legend className="field-label">When</legend>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={q.month === null} className="chip min-h-[40px]" onClick={() => set({ month: null })}>Any month</button>
              {MONTHS_SHORT.map((m, i) => (
                <button key={m} type="button" aria-pressed={q.month === i + 1} aria-label={MONTHS[i]} className="chip num min-h-[40px] px-2.5"
                  onClick={() => set({ month: i + 1 })}>{m}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="field-label">What you like</legend>
            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.map(([id, l]) => (
                <button key={id} type="button" aria-pressed={q.interests.includes(id)} className="chip min-h-[40px]"
                  onClick={() => set({ interests: q.interests.includes(id) ? q.interests.filter((x) => x !== id) : [...q.interests, id] })}>{l}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="field-label">Trip style</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Trip style">
              {STYLES.map(([id, l]) => (
                <button key={id} type="button" role="radio" aria-checked={q.style === id} className="chip min-h-[40px]" onClick={() => set({ style: id })}>{l}</button>
              ))}
            </div>
          </fieldset>
        </form>

        <section aria-labelledby="ideas-h" aria-busy={res.state === 'loading'}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ideas-h" className="type-semiwide text-xl font-bold">
              {res.state === 'ready' ? (budgetTotal ? `${fitting} of ${ideas.length} trips fit` : `${ideas.length} trips for your group`) : 'Trips for your group'}
            </h2>
            <p className="text-sm text-ink-600" role="status">
              {res.state === 'loading' ? 'Planning every trip…' : res.state === 'ready'
                ? `${plural(q.days, 'day')} from ${q.origin}, ${plural(people, 'person', 'people')}${q.month ? `, ${MONTHS[q.month - 1]}` : ''}` : ''}
            </p>
          </div>

          {res.state === 'error' && (
            <Notice level="danger" className="mt-4" action={<button type="button" className="btn-outline" onClick={() => setQ({ ...q })}>Try again</button>}>
              {res.error?.message || 'The trips could not be loaded.'}
            </Notice>
          )}
          {planErr && <Notice level="danger" className="mt-4">{planErr}</Notice>}

          {res.state === 'loading' && !ideas.length && (
            <ul className="mt-4 grid gap-5 md:grid-cols-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <li key={i} className="h-96 animate-pulse rounded-lg bg-limestone-300/60" />)}
            </ul>
          )}

          {ideas.length > 0 && (
            <>
              {budgetTotal && fitting === 0 && res.state === 'ready' && (
                <Notice level="info" className="mt-4">
                  Nothing fits {pkr(budgetTotal)} for {plural(people, 'person', 'people')} yet. The closest trips are first: try a day or two less,
                  fewer people sharing the cost, or a bigger budget.
                </Notice>
              )}
              <ul className={`mt-4 grid gap-5 md:grid-cols-2 ${res.state === 'loading' ? 'opacity-60' : ''}`}>
                {shown.map((idea, i) => (
                  <IdeaCard key={idea.id} idea={idea} rank={i} budgetTotal={budgetTotal} onPlan={plan} busy={planning !== null} />
                ))}
              </ul>
              {ideas.length > shown.length && (
                <button type="button" className="btn-outline mt-5" onClick={() => setShowAll(true)}>Show {ideas.length - shown.length} more</button>
              )}
              {planning && <p className="mt-3 text-sm text-ink-600" role="status">Opening the plan…</p>}
              <p className="mt-6 text-xs text-ink-500">{res.data?.note}</p>
            </>
          )}
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-600">
            <Compass size={16} aria-hidden="true" /> Already know where? <Link to="/plan" className="link">Plan it in your own words</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
