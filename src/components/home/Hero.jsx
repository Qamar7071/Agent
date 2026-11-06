import { useRef, useState } from 'react';
import { ArrowRight, Compass, Languages, Minus, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import Photo from '../ui/Photo.jsx';
import RouteProfile from './RouteProfile.jsx';
import VoiceButton from '../shared/VoiceButton.jsx';
import { creditLine, photos } from '../../data/photos.js';
import { destinations, origins } from '../../lib/data.js';
import { MONTHS } from '../../lib/format.js';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { Link, useRouter } from '../../lib/router.jsx';

const examples = [
  { text: '6 days in Hunza from Lahore in April, 2 of us, Rs 1,50,000', lang: 'English' },
  { text: '5 din Skardu jana hai, 4 log hain, budget 1 lakh hai', lang: 'Roman Urdu' },
  { text: 'Fairy Meadows next month, budget 80k per person', lang: 'English' },
];
const SHORT = { 'skardu': 'Skardu', 'hunza': 'Hunza', 'fairy-meadows': 'Fairy Meadows', 'deosai': 'Deosai', 'passu': 'Passu',
  'khunjerab': 'Khunjerab', 'attabad': 'Attabad', 'k2': 'K2 Base Camp' };
const SHORTCUT_ORDER = ['skardu', 'hunza', 'khunjerab', 'deosai', 'fairy-meadows', 'attabad', 'passu', 'k2'];
const MAX = 2000;
const nextMonth = () => ((new Date().getMonth() + 1) % 12) + 1;

function Stepper({ id, label, value, min, max, onChange }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-600">{label}</label>
      <div className="flex h-11 items-center rounded-lg border border-limestone-400 bg-paper">
        <button type="button" className="flex h-full w-9 items-center justify-center rounded-l-lg text-ink-600 hover:bg-limestone disabled:opacity-40" disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer: ${label}`}><Minus size={15} aria-hidden="true" /></button>
        <input id={id} inputMode="numeric" value={value} className="num h-full w-full min-w-0 bg-transparent text-center font-semibold text-ink outline-none"
          onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, '')); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v || min))); }} />
        <button type="button" className="flex h-full w-9 items-center justify-center rounded-r-lg text-ink-600 hover:bg-limestone disabled:opacity-40" disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More: ${label}`}><Plus size={15} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function AskForm() {
  const { send } = usePlanner();
  const { navigate } = useRouter();
  const [text, setText] = useState('');
  const go = (message) => {
    navigate('/plan');
    if (message.trim()) send(message.slice(0, MAX));
  };
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); go(text); }}>
        <label htmlFor="hero-ask" className="sr-only">Describe your trip</label>
        <div className="rounded-xl bg-paper p-2 shadow-card ring-1 ring-black/5">
          <textarea id="hero-ask" rows={2} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(text); } }}
            placeholder="Where, when, how many of you, budget… in English or Roman Urdu"
            className="block min-h-[3.25rem] w-full resize-none bg-transparent px-2.5 py-2 text-base text-ink outline-none placeholder:text-ink-500" autoComplete="off" />
          <div className="flex items-center justify-between gap-2 border-t border-limestone-300 px-1 pt-2">
            <span className="hidden items-center gap-1.5 pl-1 text-xs text-ink-600 sm:inline-flex"><Languages size={14} aria-hidden="true" /> English or Roman Urdu</span>
            <div className="ml-auto flex items-center gap-2">
              <VoiceButton value={text} onText={(t) => setText(t.slice(0, MAX))} />
              <button type="submit" className="btn-accent h-[52px] px-5 text-base">
                <Sparkles size={18} aria-hidden="true" /> Plan My Trip with AI
              </button>
            </div>
          </div>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/80">Try:</span>
        {examples.map((ex) => (
          <button key={ex.text} type="button" onClick={() => go(ex.text)}
            className="group inline-flex min-h-[36px] items-center gap-2 rounded-full border border-white/25 bg-white/[0.06] px-3 py-1.5 text-left text-white transition-colors hover:border-white/60 hover:bg-white/15">
            <span>{ex.text}</span>
            {ex.lang !== 'English' && <span className="rounded-full bg-apricot/90 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-juniper-950">{ex.lang}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function BudgetForm() {
  const { navigate } = useRouter();
  const [q, setQ] = useState({ from: 'Islamabad', days: 6, people: 2, budget: '', month: nextMonth() });
  const set = (patch) => setQ((p) => ({ ...p, ...patch }));
  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams({ from: q.from, days: String(q.days), people: String(q.people), month: q.month ? String(q.month) : 'any' });
    if (q.budget) params.set('budget', q.budget);
    navigate(`/explore?${params}`);
  };
  return (
    <form onSubmit={submit} className="rounded-xl bg-paper p-3 shadow-card ring-1 ring-black/5 sm:p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr_1.3fr_1.2fr]">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="hb-from" className="mb-1 block text-xs font-semibold text-ink-600">Starting from</label>
          <select id="hb-from" className="field h-11 min-h-0 py-0" value={q.from} onChange={(e) => set({ from: e.target.value })}>
            {origins.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <Stepper id="hb-days" label="Days" value={q.days} min={2} max={30} onChange={(v) => set({ days: v })} />
        <Stepper id="hb-people" label="People" value={q.people} min={1} max={20} onChange={(v) => set({ people: v })} />
        <div>
          <label htmlFor="hb-budget" className="mb-1 block text-xs font-semibold text-ink-600">Budget (Rs, total)</label>
          <input id="hb-budget" inputMode="numeric" placeholder="e.g. 150000" value={q.budget} className="field num h-11 min-h-0"
            onChange={(e) => set({ budget: e.target.value.replace(/[^\d]/g, '').slice(0, 8) })} />
        </div>
        <div>
          <label htmlFor="hb-month" className="mb-1 block text-xs font-semibold text-ink-600">Month</label>
          <select id="hb-month" className="field h-11 min-h-0 py-0" value={q.month ?? ''} onChange={(e) => set({ month: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Any month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-600">Raahi plans every trip it knows for your group and shows which ones fit. Estimates, not quotes.</p>
        <button type="submit" className="btn-accent h-12 px-5 text-base">Show trips that fit <ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </form>
  );
}

const TABS = [['ask', 'Ask Raahi', Sparkles], ['budget', 'Where can we go?', Compass]];

export default function Hero() {
  const [tab, setTab] = useState('ask');
  const refs = useRef({});
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(next);
    refs.current[next]?.focus();
  };
  return (
    <section aria-labelledby="hero-title" className="on-dark relative isolate overflow-hidden bg-juniper-950 text-white">
      <div className="absolute inset-0 -z-20">
        <Photo id="passu" priority sizes="100vw" position="50% 62%" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(13,33,25,0.94)_0%,rgba(13,33,25,0.78)_44%,rgba(13,33,25,0.3)_78%,rgba(13,33,25,0.4)_100%)]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-juniper-950 via-juniper-950/70 to-transparent" />
      <div aria-hidden="true" className="topo absolute inset-0 -z-10 text-apricot-300 [--topo-opacity:0.08] [mask-image:linear-gradient(to_top,black,transparent_70%)]" />

      <div className="mx-auto flex min-h-[92svh] max-w-page flex-col justify-end px-4 pb-8 pt-28 sm:px-6 lg:min-h-[100svh]">
        <p className="eyebrow animate-fadeUp">AI travel companion · Gilgit-Baltistan</p>
        <h1 id="hero-title" className="type-wide mt-4 max-w-[19ch] animate-fadeUp text-[clamp(2.2rem,4.7vw,3.85rem)] font-extrabold leading-[1.04] [animation-delay:60ms]">
          Your Journey Through Northern Pakistan Starts Here.
        </h1>
        <p className="mt-5 max-w-[56ch] animate-fadeUp text-lg text-white/90 [animation-delay:120ms]">
          Meet Raahi, your intelligent travel companion. Plan smarter journeys, bring your group together, and travel
          confidently through the mountains.
        </p>

        <div className="glass mt-8 max-w-3xl animate-fadeUp rounded-3xl p-3 [animation-delay:180ms] sm:p-4">
          <div role="tablist" aria-label="How to start" className="mb-3 flex gap-1 rounded-full bg-black/20 p-1">
            {TABS.map(([id, label, Icon], i) => (
              <button key={id} ref={(el) => { refs.current[id] = el; }} id={`hero-tab-${id}`} type="button" role="tab"
                aria-selected={tab === id} aria-controls={`hero-panel-${id}`} tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)} onKeyDown={(e) => onKey(e, i)}
                className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors sm:flex-none sm:px-4 ${tab === id ? 'bg-white text-juniper-900 shadow-sm' : 'text-white/85 hover:text-white'}`}>
                <Icon size={16} aria-hidden="true" className="hidden sm:block" /> {label}
              </button>
            ))}
          </div>
          <div id={`hero-panel-${tab}`} role="tabpanel" aria-labelledby={`hero-tab-${tab}`}>
            {tab === 'ask' ? <AskForm /> : <BudgetForm />}
          </div>
          <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-white/75">
            <ShieldCheck size={14} aria-hidden="true" /> Live forecasts where available, honest estimates in rupees, and nothing is ever booked for you.
          </p>
        </div>

        <nav aria-label="Popular destinations" className="mt-6">
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {SHORTCUT_ORDER.filter((id) => destinations.some((d) => d.id === id)).map((id) => (
              <li key={id} className="shrink-0">
                <Link to={`/destinations/${id}`} className="group inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3.5 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 hover:ring-white/40">
                  <img src={`/images/${id}-thumb.webp`} alt="" width="32" height="32" loading="lazy" decoding="async" className="h-8 w-8 rounded-full object-cover" />
                  {SHORT[id]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <RouteProfile />
        <p className="mt-6 text-xs text-white/70">{photos.passu.place}. {creditLine('passu')}.</p>
      </div>
    </section>
  );
}
