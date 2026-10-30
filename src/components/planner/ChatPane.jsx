import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, RotateCcw, SendHorizontal, SquarePen } from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { km, pkr } from '../../lib/format.js';
import MiniMarkdown from '../ui/MiniMarkdown.jsx';
import Forecast from '../shared/Forecast.jsx';
import RoadStatus from '../shared/RoadStatus.jsx';

const MAX = 2000;

function Working() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 self-start rounded-md border border-limestone-300 bg-paper px-4 py-3 text-sm text-ink-600" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-juniper-600" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </span>
      Raahi is working on it{secs >= 3 ? ` (${secs} s)` : ''}…
    </div>
  );
}

function Trace({ items }) {
  if (!items?.length) return null;
  return (
    <div className="rounded border border-limestone-300 bg-limestone px-3 py-2">
      <p className="text-xs font-semibold text-ink-600">What Raahi checked</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={`${t.tool}-${i}`} className="flex gap-2 text-xs text-ink-700">
            {t.ok
              ? <CheckCircle2 size={14} className="mt-[1px] shrink-0 text-juniper-600" aria-label="Done" />
              : <CircleSlash size={14} className="mt-[1px] shrink-0 text-ochre" aria-label="Could not complete" />}
            <span>{t.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Extras({ m, onShowPlan }) {
  const forecasts = m.weather ? Object.values(m.weather) : [];
  return (
    <>
      {forecasts.map((f) => (
        <div key={f.destination?.id || f.reason} className="rounded border border-limestone-300 bg-paper px-3 py-2">
          <p className="text-sm font-semibold">{f.destination?.name || 'Forecast'}</p>
          <Forecast forecast={f} days={3} />
        </div>
      ))}
      {m.roads && (
        <div className="rounded border border-limestone-300 bg-paper px-3 py-3">
          <RoadStatus status={m.roads} compact />
        </div>
      )}
      {m.route?.curated_estimate && (
        <div className="rounded border border-limestone-300 bg-paper px-3 py-2 text-sm">
          <p className="font-semibold">{m.route.from} to {m.route.to}</p>
          <p className="text-ink-700">
            About {km(m.route.curated_estimate.km)}, {m.route.curated_estimate.time} of driving
            {m.route.curated_estimate.driving_days > 1 ? `, best split over ${m.route.curated_estimate.driving_days} days` : ''}. Approximate.
          </p>
          {m.route.maps_url && <a href={m.route.maps_url} target="_blank" rel="noopener noreferrer" className="link text-sm">Open in Google Maps</a>}
        </div>
      )}
      {m.budget && (
        <div className="rounded border border-limestone-300 bg-paper px-3 py-2 text-sm">
          <p className="font-semibold">Estimated cost: {pkr(m.budget.total)}</p>
          <p className="text-ink-600">{m.budget.comparison?.message}</p>
        </div>
      )}
      {m.planned && (
        <button type="button" onClick={onShowPlan} className="btn-outline min-h-[40px] self-start">
          View the plan
        </button>
      )}
    </>
  );
}

function Message({ m, onShowPlan, showNotice }) {
  const { retry } = usePlanner();
  if (m.system) {
    return <p className="mx-auto max-w-[90%] text-center text-xs text-ink-500">{m.text}</p>;
  }
  if (m.role === 'user') {
    return <p className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-md rounded-tr-sm bg-juniper px-4 py-2.5 text-on-juniper">{m.text}</p>;
  }
  if (m.error) {
    return (
      <div className="max-w-[92%] rounded-md border border-brick/40 bg-brick-50 px-4 py-3 text-sm" role="alert">
        <p className="flex items-center gap-2 font-semibold text-ink"><AlertTriangle size={16} className="text-brick" aria-hidden="true" /> No answer this time</p>
        <p className="mt-1 text-ink-700">{m.text}</p>
        <button type="button" onClick={() => retry(m.id)} className="btn-outline mt-3 min-h-[38px]">
          <RotateCcw size={15} aria-hidden="true" /> Send again
        </button>
      </div>
    );
  }
  return (
    <div className="flex max-w-[94%] flex-col gap-2">
      <div className="rounded-md rounded-tl-sm border border-limestone-300 bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink-700">
        <MiniMarkdown text={m.text} />
      </div>
      {m.notice && showNotice && <p className="text-xs text-ink-500">{m.notice}</p>}
      <Trace items={m.trace} />
      <Extras m={m} onShowPlan={onShowPlan} />
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
        <div className="min-w-0">
          <h2 className="type-semiwide text-base font-bold">Raahi</h2>
          <p className="truncate text-xs text-ink-600">
            {health === null ? 'Connecting…' : aiOn ? 'AI agent with live tools' : 'Guided mode: built-in rules with the same live tools'}
          </p>
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
          return <Message key={m.id} m={m} onShowPlan={onShowPlan} showNotice={!prev || prev.notice !== m.notice} />;
        })}
        {chatBusy && <Working />}
        {!chatBusy && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Suggested replies">
            {suggestions.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {!started && !chatBusy && (
          <div className="flex flex-wrap gap-2" aria-label="Example requests">
            {['7 days in Hunza and Attabad from Islamabad in May, 2 adults, PKR 200,000', 'Skardu and Deosai in July, family of 4', 'Weather in Fairy Meadows this week', 'Is the road to Skardu open?'].map((s) => (
              <button key={s} type="button" className="chip text-left" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
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
            placeholder="Ask anything about your trip…"
            className="field max-h-40 min-h-[52px] flex-1 resize-y py-2.5"
          />
          <button type="submit" disabled={!draft.trim() || chatBusy} aria-label="Send" className="btn-primary h-[52px] w-[52px] shrink-0 px-0">
            <SendHorizontal size={20} />
          </button>
        </div>
        <p className="mt-1.5 flex justify-between gap-2 px-1 text-xs text-ink-500">
          <span>Enter to send, Shift+Enter for a new line.</span>
          {draft.length > MAX - 200 && <span className="num">{draft.length}/{MAX}</span>}
        </p>
      </form>
    </section>
  );
}
