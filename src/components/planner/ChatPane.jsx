import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleSlash, Compass, Copy, Languages, MapPinned, MessagesSquare,
  RotateCcw, SendHorizontal, ShieldCheck, SquarePen, TrendingDown, Wallet,
} from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { Link } from '../../lib/router.jsx';
import { byId } from '../../lib/data.js';
import { km, monthSpan, pkr } from '../../lib/format.js';
import { planToText } from '../../lib/planText.js';
import MiniMarkdown from '../ui/MiniMarkdown.jsx';
import CopyButton from '../ui/CopyButton.jsx';
import DataBadge from '../ui/DataBadge.jsx';
import Forecast from '../shared/Forecast.jsx';
import RoadStatus from '../shared/RoadStatus.jsx';
import VoiceButton from '../shared/VoiceButton.jsx';

const MAX = 2000;
const STARTERS = [
  { title: 'Plan a trip', icon: CalendarDays, items: [
    ['7 days in Hunza and Attabad from Islamabad in May, 2 adults, Rs 2,00,000', 'English'],
    ['5 din Skardu jana hai, 4 log hain, budget 1 lakh hai', 'Roman Urdu'],
  ] },
  { title: 'Ideas and safety', icon: Compass, items: [
    ['Hunza mein family ke saath best places suggest karo', 'Roman Urdu'],
    ['Deosai jana safe rahega is month?', 'Roman Urdu'],
  ] },
  { title: 'Conditions', icon: ShieldCheck, items: [
    ['Weather in Fairy Meadows this week', 'English'],
    ['Is the road to Skardu open?', 'English'],
  ] },
];
const CHANGE = {
  accommodation: { budget: 'budget stays', mid: 'mid-range stays', premium: 'premium stays' },
  transport: { bus: 'public coaches', car: 'a hired car', flight: 'flying north' },
};
const changeWords = (change = {}) => Object.entries(change)
  .map(([k, v]) => (k === 'days' ? `${v} days` : CHANGE[k]?.[v] || `${k} ${v}`)).join(' and ');

function Working() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 self-start rounded-2xl rounded-tl-md border border-limestone-300 bg-paper px-4 py-3 text-sm text-ink-600 shadow-card" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-juniper-600" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </span>
      Raahi is checking the road network, seasons and costs{secs >= 3 ? ` (${secs} s)` : ''}…
    </div>
  );
}

function Trace({ items }) {
  if (!items?.length) return null;
  return (
    <details className="group rounded-xl border border-limestone-300 bg-limestone/60 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink-600">
        <span>What Raahi checked ({items.length})</span>
        <span className="text-ink-500 group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={`${t.tool}-${i}`} className="flex gap-2 text-xs text-ink-700">
            {t.ok
              ? <CheckCircle2 size={14} className="mt-[1px] shrink-0 text-juniper-600" aria-label="Done" />
              : <CircleSlash size={14} className="mt-[1px] shrink-0 text-ochre" aria-label="Could not complete" />}
            <span>{t.summary}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PlanCard({ m, latest, onShowPlan }) {
  const { itinerary } = usePlanner();
  const p = m.planSummary;
  const over = p.status === 'over' || p.status === 'tight';
  return (
    <div className="overflow-hidden rounded-2xl border border-limestone-300 bg-paper shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-limestone-300 bg-juniper-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-juniper-700">Your plan</p>
          <p className="type-semiwide truncate font-bold">{p.title}</p>
          <p className="text-xs text-ink-600">{p.days} days{p.travel ? `, ${p.travel} mainly travel` : ''}</p>
        </div>
        <MapPinned size={22} className="mt-1 shrink-0 text-juniper-600" aria-hidden="true" />
      </div>
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="num text-xl font-extrabold">{pkr(p.total)}</p>
          <DataBadge kind="estimate" />
        </div>
        {p.perPerson && <p className="num text-xs text-ink-600">about {pkr(p.perPerson)} per person</p>}
        {p.message && <p className={`mt-1.5 text-sm ${over ? 'text-ochre-700' : 'text-juniper-700'}`}>{p.message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onShowPlan} className="btn-primary min-h-[40px] text-sm">View the plan <ArrowRight size={15} aria-hidden="true" /></button>
          {latest && itinerary && (
            <CopyButton text={() => planToText(itinerary, { site: window.location.origin })} label="Copy itinerary" className="btn-outline min-h-[40px] text-sm" confirm="Itinerary copied. Paste it anywhere." />
          )}
          {latest && itinerary && (
            <Link to="/decided?from=plan" className="btn-quiet min-h-[40px] text-sm"><MessagesSquare size={15} aria-hidden="true" /> Check it with the agents</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetFitCard({ fit, latest }) {
  const { applyChanges, planBusy, itinerary } = usePlanner();
  const saved = fit.from - fit.to;
  const alt = (fit.alternatives || []).find((a) => a.change && Object.keys(a.change).length);
  const useAlt = () => {
    const now = itinerary?.request || {};
    const want = { ...(fit.original || {}), ...alt.change };
    const ops = Object.entries(want).filter(([k, v]) => now[k] !== undefined && now[k] !== v)
      .map(([field, value]) => ({ op: 'set', field, value }));
    if (ops.length) applyChanges(ops, `Used the other option instead: ${changeWords(alt.change)}.`);
  };
  return (
    <div className="rounded-2xl border border-limestone-300 bg-paper p-4 shadow-card">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ochre-700"><TrendingDown size={14} aria-hidden="true" /> Cheaper version</p>
      <p className="num mt-1.5 flex flex-wrap items-baseline gap-x-2 text-lg font-extrabold">
        <span className="text-ink-500 line-through decoration-2">{pkr(fit.from)}</span>
        <ArrowRight size={16} className="self-center text-ink-500" aria-hidden="true" />
        <span>{pkr(fit.to)}</span>
      </p>
      <p className="mt-1 text-sm text-ink-700">
        {fit.changed ? <>Saves about <span className="num font-semibold">{pkr(saved)}</span> with {changeWords(fit.change)}. </> : 'No cheaper version within these limits. '}
        {fit.kept_days ? 'Same days and places.' : ''}
      </p>
      {!fit.fits && <p className="mt-1 text-sm text-ochre-700">Still about <span className="num">{pkr(fit.shortfall)}</span> above the target of {pkr(fit.target)}.</p>}
      {alt && latest && fit.changed && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-limestone/70 px-3 py-2 text-sm">
          <span>Or {changeWords(alt.change)}: <span className="num font-semibold">{pkr(alt.total)}</span>{alt.fits ? '' : ' (above the target)'}</span>
          <button type="button" className="btn-outline min-h-[36px] text-sm" disabled={planBusy} onClick={useAlt}>Use this instead</button>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-500">Priced by the Budget Intelligence agent from Raahi’s cost model. Estimates, not quotes.</p>
    </div>
  );
}

function DestinationCards({ items }) {
  const list = (items || []).filter((x) => byId[x.id]).slice(0, 4);
  if (!list.length) return null;
  return (
    <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Places mentioned">
      {list.map((x) => {
        const d = byId[x.id];
        return (
          <li key={x.id} className="w-56 shrink-0">
            <Link to={`/destinations/${x.id}`} className="card card-hover flex h-full items-start gap-3 p-2.5">
              <img src={`/images/${x.id}-thumb.webp`} alt="" width="48" height="48" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{d.name}</span>
                <span className="block text-xs text-ink-600">Best {monthSpan(d.best_months)} · {d.altitude_m.toLocaleString('en-US')} m</span>
                {x.why?.[0] && <span className="mt-0.5 block text-xs text-ink-500">{x.why[0]}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Extras({ m, latest, onShowPlan }) {
  const forecasts = m.weather ? Object.values(m.weather) : [];
  return (
    <>
      {m.budgetFit && <BudgetFitCard fit={m.budgetFit} latest={latest} />}
      {m.planSummary && <PlanCard m={m} latest={latest} onShowPlan={onShowPlan} />}
      {!m.planSummary && m.planned && (
        <button type="button" onClick={onShowPlan} className="btn-outline min-h-[40px] self-start">View the plan</button>
      )}
      <DestinationCards items={m.destinations} />
      {forecasts.map((f) => (
        <div key={f.destination?.id || f.reason} className="rounded-xl border border-limestone-300 bg-paper px-3 py-2">
          <p className="text-sm font-semibold">{f.destination?.name || 'Forecast'}</p>
          <Forecast forecast={f} days={3} />
        </div>
      ))}
      {m.roads && (
        <div className="rounded-xl border border-limestone-300 bg-paper px-3 py-3">
          <RoadStatus status={m.roads} compact />
        </div>
      )}
      {m.route?.curated_estimate && (
        <div className="rounded-xl border border-limestone-300 bg-paper px-3 py-2 text-sm">
          <p className="font-semibold">{m.route.from} to {m.route.to}</p>
          <p className="text-ink-700">
            About {km(m.route.curated_estimate.km)}, {m.route.curated_estimate.time} of driving
            {m.route.curated_estimate.driving_days > 1 ? `, best split over ${m.route.curated_estimate.driving_days} days` : ''}. Approximate.
          </p>
          {m.route.maps_url && <a href={m.route.maps_url} target="_blank" rel="noopener noreferrer" className="link text-sm">Open in Google Maps</a>}
        </div>
      )}
      {m.budget && !m.planSummary && (
        <div className="rounded-xl border border-limestone-300 bg-paper px-3 py-2 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Wallet size={15} aria-hidden="true" /> Estimated cost: {pkr(m.budget.total)}</p>
          <p className="text-ink-600">{m.budget.comparison?.message}</p>
        </div>
      )}
    </>
  );
}

function Message({ m, latest, onShowPlan, showNotice }) {
  const { retry } = usePlanner();
  if (m.system) {
    return <p className="mx-auto max-w-[90%] rounded-full bg-limestone-200 px-3 py-1 text-center text-xs text-ink-600">{m.text}</p>;
  }
  if (m.role === 'user') {
    return <p className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-juniper px-4 py-2.5 text-on-juniper shadow-sm">{m.text}</p>;
  }
  if (m.error) {
    return (
      <div className="max-w-[92%] rounded-2xl border border-brick/40 bg-brick-50 px-4 py-3 text-sm" role="alert">
        <p className="flex items-center gap-2 font-semibold text-ink"><AlertTriangle size={16} className="text-brick" aria-hidden="true" /> No answer this time</p>
        <p className="mt-1 text-ink-700">{m.text}</p>
        <button type="button" onClick={() => retry(m.id)} className="btn-outline mt-3 min-h-[38px]">
          <RotateCcw size={15} aria-hidden="true" /> Send again
        </button>
      </div>
    );
  }
  return (
    <div className="flex max-w-[96%] gap-2.5">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-juniper text-xs font-extrabold text-on-juniper" aria-hidden="true">R</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="group relative rounded-2xl rounded-tl-md border border-limestone-300 bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink-700 shadow-card">
          <MiniMarkdown text={m.text} />
          {!m.welcome && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-limestone-200 pt-2 text-xs text-ink-500">
              {m.lang === 'ur' && <span className="inline-flex items-center gap-1"><Languages size={12} aria-hidden="true" /> Roman Urdu</span>}
              <CopyButton text={m.text} label="Copy" done="Copied" iconSize={12} confirm="Reply copied."
                className="inline-flex min-h-[28px] items-center gap-1 rounded-md px-1.5 hover:bg-limestone hover:text-ink" />
            </div>
          )}
        </div>
        {m.notice && showNotice && <p className="text-xs text-ink-500">{m.notice}</p>}
        <Trace items={m.trace} />
        <Extras m={m} latest={latest} onShowPlan={onShowPlan} />
      </div>
    </div>
  );
}

function Starters({ onPick }) {
  return (
    <div className="flex flex-col gap-3" aria-label="Example requests">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Start with one of these</p>
      {STARTERS.map((g) => {
        const Icon = g.icon;
        return (
          <div key={g.title}>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700"><Icon size={15} aria-hidden="true" /> {g.title}</p>
            <ul className="flex flex-col gap-1.5">
              {g.items.map(([text, lang]) => (
                <li key={text}>
                  <button type="button" onClick={() => onPick(text)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-limestone-300 bg-paper px-3 py-2.5 text-left text-sm transition hover:border-juniper-500 hover:shadow-card">
                    <span>{text}</span>
                    {lang !== 'English' && <span className="shrink-0 rounded-full bg-apricot-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ochre-700">{lang}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function ChatPane({ onShowPlan, onOpenForm }) {
  const { messages, chatBusy, send, suggestions, health, newTrip, itinerary } = usePlanner();
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const started = messages.some((m) => m.role === 'user');
  const aiOn = health?.ai?.configured;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.system && !m.welcome && !m.error);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, chatBusy]);

  const submit = (e) => {
    e?.preventDefault();
    if (!draft.trim() || chatBusy) return;
    send(draft.slice(0, MAX));
    setDraft('');
  };

  return (
    <section aria-label="Chat with Raahi" className="flex h-full min-h-0 flex-col bg-limestone">
      <div className="flex items-center justify-between gap-3 border-b border-limestone-300 bg-paper px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-juniper text-sm font-extrabold text-on-juniper" aria-hidden="true">
            R
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-paper ${health === null ? 'bg-limestone-400' : aiOn ? 'bg-[#3DDC97]' : 'bg-apricot'}`} />
          </span>
          <div className="min-w-0">
            <h2 className="type-semiwide text-base font-bold leading-tight">Raahi</h2>
            <p className="truncate text-xs text-ink-600">
              {health === null ? 'Connecting…' : aiOn ? 'AI agent with live tools · English or Roman Urdu' : 'Guided mode: built-in rules with the same live tools'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={onOpenForm} className="btn-quiet text-sm">Trip details</button>
          {(started || itinerary) && (
            <button type="button" onClick={() => { if (window.confirm('Start a new trip? The current chat and plan will be cleared (saved trips stay in My trips).')) newTrip(); }} className="btn-quiet text-sm" aria-label="Start a new trip">
              <SquarePen size={16} aria-hidden="true" /> New
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5" aria-live="polite" aria-busy={chatBusy}>
        {messages.map((m, i) => {
          const prev = messages.slice(0, i).reverse().find((x) => x.role === 'assistant' && !x.system && !x.welcome);
          return <Message key={m.id} m={m} latest={m === lastAssistant} onShowPlan={onShowPlan} showNotice={!prev || prev.notice !== m.notice} />;
        })}
        {chatBusy && <Working />}
        {!chatBusy && suggestions.length > 0 && started && (
          <div className="flex flex-wrap gap-2 pl-10" aria-label="Suggested replies">
            {suggestions.map((s) => (
              <button key={s} type="button" className="chip hover:shadow-card" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {!started && !chatBusy && <Starters onPick={send} />}
      </div>

      <form onSubmit={submit} className="border-t border-limestone-300 bg-paper px-3 pb-3 pt-3">
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Message Raahi</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={2}
            value={draft}
            maxLength={MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            placeholder="Ask anything about your trip, in English or Roman Urdu…"
            className="field max-h-40 min-h-[52px] flex-1 resize-y py-2.5"
          />
          <VoiceButton value={draft} disabled={chatBusy} onText={(text) => setDraft(text.slice(0, MAX))} />
          <button type="submit" disabled={!draft.trim() || chatBusy} aria-label="Send" className="btn-primary h-[52px] w-[52px] shrink-0 px-0">
            <SendHorizontal size={20} />
          </button>
        </div>
        <p className="mt-1.5 flex justify-between gap-2 px-1 text-xs text-ink-500">
          <span>Enter to send, Shift+Enter for a new line. <Copy size={11} className="inline" aria-hidden="true" /> Copy any reply.</span>
          {draft.length > MAX - 200 && <span className="num">{draft.length}/{MAX}</span>}
        </p>
      </form>
    </section>
  );
}
