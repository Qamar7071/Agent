// The agents of one run as stages, left to right (top to bottom on a phone). Stages come from
// the run's real dependencies (lib/pipeline.js); each agent shows its real status, time, tool
// calls and retries from the server's records. A running agent pulses only while the server
// says it is running: nothing here is animated for show.
import { useMemo } from 'react';
import { ChevronRight, RotateCcw, Wrench } from 'lucide-react';
import { AgentAvatar } from '../ui/AgentAvatar.jsx';
import { duration, progress, rerunBy, stagesOf } from '../../lib/pipeline.js';
import { STATUS } from './AgentFlow.jsx';

// Short status words for the small chips; the full words are in the label and the details.
const SHORT = { completed: 'Done', running: 'Running', retrying: 'Retrying', failed: 'Failed', queued: 'Queued',
  waiting_for_approval: 'Needs you', skipped: 'Not needed', idle: 'Idle' };

function Chip({ t, byId, selected, onSelect, dark }) {
  const s = STATUS[t.status] || STATUS.idle;
  const again = rerunBy(t, byId);
  const live = t.status === 'running' || t.status === 'retrying';
  const body = (
    <>
      <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <AgentAvatar agent={t.agent} label={t.label} size={30} />
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold ${dark ? 'text-ink-600' : 'text-ink-700'}`}>
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-breathe' : ''}`} style={{ background: s.color }} aria-hidden="true" />
          {SHORT[t.status] || s.label}{live ? '…' : ''}
        </span>
      </span>
      <span className="mt-1.5 block text-left text-[13px] font-semibold leading-snug">{t.label}</span>
      <span className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] ${dark ? 'text-ink-500' : 'text-ink-600'}`}>
        {t.duration_ms != null && <span className="num">{duration(t.duration_ms)}</span>}
        {t.tool_calls?.length > 0 && <span className="inline-flex items-center gap-0.5"><Wrench size={11} aria-hidden="true" />{t.tool_calls.length}<span className="sr-only"> tool calls</span></span>}
        {t.retries > 0 && <span className="inline-flex items-center gap-0.5 text-[#B7791F]"><RotateCcw size={11} aria-hidden="true" />{t.retries}<span className="sr-only"> retries</span></span>}
      </span>
      {again && <span className="mt-1 block text-left text-[11px] font-medium leading-snug text-iris-700">Run again, asked by {again.label}</span>}
    </>
  );
  const cls = `flex w-full flex-col items-start rounded-xl border p-2.5 transition ${dark ? 'border-white/10 bg-white/[0.04] hover:border-white/25' : 'border-limestone-300 bg-paper hover:border-juniper-500'} ${selected ? (dark ? 'border-[#F2C27F] ring-1 ring-[#F2C27F]' : 'border-juniper ring-1 ring-juniper') : ''} ${t.status === 'skipped' ? 'opacity-60' : ''}`;
  if (!onSelect) return <div className={cls} title={`${t.label}: ${s.label}`}>{body}</div>;
  return (
    <button type="button" onClick={() => onSelect(t.id)} aria-pressed={selected}
      aria-label={`${t.label}: ${s.label}${t.duration_ms != null ? `, ${duration(t.duration_ms)}` : ''}. Show details`} className={cls}>
      {body}
    </button>
  );
}

export default function AgentPipeline({ tasks = [], selected = null, onSelect = null, dark = false, caption = true, compact = false }) {
  const stages = useMemo(() => stagesOf(tasks), [tasks]);
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const p = progress(tasks);
  if (!tasks.length) return null;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <figure className="m-0">
      <div className={`h-1 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-limestone-300'}`} role="progressbar"
        aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label={`${p.done} of ${p.total} agents finished`}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${p.failed ? 'bg-[#E25B47]' : dark ? 'bg-[#3DDC97]' : 'bg-juniper-600'}`} style={{ width: `${pct}%` }} />
      </div>
      <ol className={`mt-4 flex flex-col gap-3 ${compact ? '' : 'lg:flex-row lg:items-stretch lg:gap-0'}`}>
        {stages.map((st, i) => (
          <li key={st.index} className={`flex min-w-0 ${compact ? 'flex-col' : 'flex-col lg:flex-1 lg:flex-row'}`}>
            <div className={`flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-2 ${dark ? 'bg-white/[0.025]' : 'bg-limestone/70'}`}>
              <p className={`flex items-baseline gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.14em] ${dark ? 'text-ink-500' : 'text-ink-600'}`}>
                <span className="num">{i + 1}</span><span>{st.name}</span>
                {st.tasks.length > 1 && <span className="font-medium normal-case tracking-normal">×{st.tasks.length}<span className="sr-only"> agents in parallel</span></span>}
              </p>
              <ul className={`grid grid-cols-2 gap-1.5 ${compact ? 'sm:grid-cols-3' : 'sm:grid-cols-3 lg:grid-cols-1'}`}>
                {st.tasks.map((t) => <li key={t.id} className="min-w-0"><Chip t={t} byId={byId} selected={selected === t.id} onSelect={onSelect} dark={dark} /></li>)}
              </ul>
            </div>
            {i < stages.length - 1 && (
              <span aria-hidden="true" className={`flex shrink-0 items-center justify-center ${compact ? 'h-3' : 'h-3 lg:h-auto lg:w-5 lg:items-start lg:pt-[3.25rem]'} ${dark ? 'text-ink-500' : 'text-ink-500'}`}>
                <ChevronRight size={16} className={compact ? 'rotate-90' : 'rotate-90 lg:rotate-0'} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {caption && (
        <figcaption className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs ${dark ? 'text-ink-500' : 'text-ink-600'}`}>
          <span className="num">{p.done}/{p.total} agents finished</span>
          {p.running > 0 && <span>{p.running} working now</span>}
          <span className="num">{p.tools} tool calls</span>
          {p.retries > 0 && <span className="num">{p.retries} {p.retries === 1 ? 'retry' : 'retries'}</span>}
          {p.failed > 0 && <span className="font-semibold text-[#E25B47]">{p.failed} failed</span>}
          <span>Stages follow each agent’s real dependencies.</span>
        </figcaption>
      )}
    </figure>
  );
}
