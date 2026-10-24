import { useEffect, useRef, useState } from 'react';
import { CloudSun, Compass, Maximize2, MapPin, Minus, RefreshCw, RotateCcw, Route, Wallet, X, WifiOff, AlertTriangle, SendHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { quickActions } from '../../data/content.js';
import MiniMarkdown from './MiniMarkdown.jsx';
import { ActionChips, DestinationStrip, ItinerarySummary, LinkList, WeatherBlock } from './RichBlocks.jsx';

const icons = { Compass, Route, Wallet, CloudSun, MapPin };
const iconTone = {
  discover: 'text-leaf bg-leaf-50',
  itinerary: 'text-brand bg-brand-50',
  budget: 'text-teal-600 bg-teal-50',
  conditions: 'text-sun bg-sun-50',
  nearby: 'text-rose bg-rose-50',
};

function Status({ mode, thinking }) {
  const s = thinking
    ? { dot: 'bg-brand animate-pulse', label: 'Thinking…' }
    : mode === 'offline'
      ? { dot: 'bg-sun', label: 'Offline guide' }
      : mode === 'degraded'
        ? { dot: 'bg-sun', label: 'Guided mode' }
      : { dot: 'bg-leaf', label: 'Online' };
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function RaahiAvatar({ size = 48 }) {
  return (
    <span aria-hidden="true" className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-brand-50 ring-2 ring-brand-100" style={{ width: size, height: size }}>
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 40 40" fill="none">
        <rect x="6" y="9" width="28" height="22" rx="10" fill="#1570EF" />
        <rect x="10" y="14" width="20" height="11" rx="5.5" fill="#0B1B2E" />
        <circle cx="15.5" cy="19.5" r="2.2" fill="#7FD3FF" />
        <circle cx="24.5" cy="19.5" r="2.2" fill="#7FD3FF" />
        <rect x="18.5" y="3" width="3" height="6" rx="1.5" fill="#1570EF" />
        <circle cx="20" cy="3.5" r="2.5" fill="#3D8BFF" />
        <rect x="2" y="16" width="4" height="8" rx="2" fill="#3D8BFF" />
        <rect x="34" y="16" width="4" height="8" rx="2" fill="#3D8BFF" />
      </svg>
    </span>
  );
}

function Thinking() {
  return (
    <div className="flex w-fit items-center gap-3 rounded-2xl rounded-tl-md bg-surface px-4 py-3" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
      <span className="text-[13px] text-ink-600">Raahi is planning…</span>
    </div>
  );
}

function Message({ m }) {
  const { retry, reconnect } = useApp();
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-brand px-4 py-2.5 text-[14px] font-medium text-white">{m.text}</p>
      </div>
    );
  }
  if (m.error) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-rose/25 bg-rose-50 px-4 py-3 text-[13.5px] text-ink" role="alert">
        <span className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} className="text-rose" aria-hidden="true" /> Couldn’t get an answer</span>
        <span className="text-ink-600">{m.text}</span>
        <button type="button" onClick={() => retry(m.id)} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12.5px] font-semibold text-white">
          <RotateCcw size={13} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {m.switchedOffline && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sun-50 px-3 py-2 text-[12.5px] text-ink-700">
          <WifiOff size={14} className="text-sun" aria-hidden="true" />
          <span>AI backend not reachable — answering from Raahi’s offline guide.</span>
          <button type="button" onClick={reconnect} className="font-semibold text-brand hover:underline">Retry AI</button>
        </div>
      )}
      {m.aiAvailable === false && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sun-50 px-3 py-2 text-[12.5px] text-ink-700">
          <AlertTriangle size={14} className="text-sun" aria-hidden="true" />
          <span>AI model unavailable — showing a grounded guide reply.</span>
          <button type="button" onClick={reconnect} className="font-semibold text-brand hover:underline">Retry AI</button>
        </div>
      )}
      {m.text && (
        <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-[14px] leading-relaxed text-ink-700">
          <MiniMarkdown text={m.text} />
        </div>
      )}
      {m.weatherId && <WeatherBlock id={m.weatherId} />}
      <DestinationStrip ids={m.destinations} />
      <ItinerarySummary plan={m.itinerary} />
      <LinkList links={m.links} />
      <ActionChips actions={m.actions} />
    </div>
  );
}

export default function AssistantPanel({ variant = 'hero', onClose, autoFocus = false }) {
  const { messages, thinking, mode, send, resetChat, openAssistant } = useApp();
  const [draft, setDraft] = useState('');
  const [minimised, setMinimised] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const started = messages.some((m) => m.role === 'user');
  const isSheet = variant === 'sheet';

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (e) => {
    e?.preventDefault();
    if (!draft.trim() || thinking) return;
    send(draft);
    setDraft('');
    setMinimised(false);
  };

  const headerBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition hover:bg-surface hover:text-ink';

  return (
    <section
      aria-label="Raahi AI travel assistant"
      className={`flex flex-col overflow-hidden bg-white text-ink ${isSheet ? 'h-full' : `rounded-[24px] shadow-panel ring-1 ring-black/5 ${minimised ? '' : 'h-[540px]'}`}`}
    >
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <RaahiAvatar />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-display text-[19px] font-semibold leading-tight">
            Raahi <span className="text-brand">AI</span>
          </p>
          <Status mode={mode} thinking={thinking} />
        </div>
        {started && (
          <button type="button" onClick={resetChat} className={headerBtn} aria-label="Start a new conversation">
            <RefreshCw size={16} />
          </button>
        )}
        {isSheet ? (
          <button type="button" onClick={onClose} className={headerBtn} aria-label="Close assistant">
            <X size={19} />
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setMinimised((v) => !v)} className={headerBtn} aria-label={minimised ? 'Expand chat' : 'Minimise chat'} aria-expanded={!minimised}>
              <Minus size={19} />
            </button>
            <button type="button" onClick={openAssistant} className={headerBtn} aria-label="Open chat in full view">
              <Maximize2 size={16} />
            </button>
          </>
        )}
      </header>

      {!minimised && (
        <>
          <div ref={listRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 pt-1 [scrollbar-width:thin]" aria-live="polite" aria-busy={thinking}>
            {messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}

            {!started && (
              <ul className="flex flex-col items-start gap-2" aria-label="Quick actions">
                {quickActions.map((q) => {
                  const Icon = icons[q.icon];
                  return (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => send(q.prompt, { intent: q.id })}
                        className="inline-flex min-h-[42px] items-center gap-2.5 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-4 text-left text-[14px] font-medium text-ink-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${iconTone[q.id]}`}>
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        {q.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {thinking && <Thinking />}
          </div>

          <form onSubmit={submit} className="px-4 pb-4 pt-2">
            <div className="flex items-end gap-2">
              <label htmlFor={`chat-${variant}`} className="sr-only">Message Raahi</label>
              <textarea
                id={`chat-${variant}`}
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) submit(e);
                }}
                placeholder="Type your message…"
                className="max-h-28 min-h-[46px] flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[14.5px] text-ink placeholder:text-ink-400 focus:border-brand-300 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || thinking}
                aria-label="Send message"
                className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-brand transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              >
                <SendHorizontal size={19} />
              </button>
            </div>
            <p className="mt-2 px-1 text-[11.5px] text-ink-400">Raahi never guesses live weather, road status or bookings.</p>
          </form>
        </>
      )}
    </section>
  );
}
