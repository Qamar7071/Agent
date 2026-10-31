// Timeline and per-task details of one run, all from the server's execution events.
import { Fragment } from 'react';
import { STATUS } from './AgentFlow.jsx';

const ms = (iso) => (iso ? new Date(iso).getTime() : null);

export function Timeline({ tasks, startedAt, onSelect }) {
  const t0 = ms(startedAt) || Math.min(...tasks.map((t) => ms(t.queued_at)).filter(Boolean));
  const now = Date.now();
  const spans = tasks.filter((t) => t.started_at).map((t) => ({
    t, start: ms(t.started_at) - t0, end: (ms(t.ended_at) || now) - t0,
  }));
  if (!spans.length) return null;
  const total = Math.max(1, ...spans.map((s) => s.end));
  return (
    <div>
      <ol className="flex flex-col gap-1.5">
        {spans.sort((a, b) => a.start - b.start).map(({ t, start, end }) => {
          const s = STATUS[t.status] || STATUS.idle;
          return (
            <li key={t.id} className="grid grid-cols-[minmax(110px,180px)_1fr_64px] items-center gap-3 text-xs">
              <button type="button" onClick={() => onSelect?.(t.id)} className="min-h-[28px] truncate text-left text-ink-700 hover:text-ink hover:underline">
                {t.label}
              </button>
              <div className="relative h-3 rounded-full bg-white/5" aria-hidden="true">
                <div className="absolute inset-y-0 rounded-full" style={{
                  left: `${(start / total) * 100}%`, width: `${Math.max(0.8, ((end - start) / total) * 100)}%`, background: s.color,
                  boxShadow: `0 0 10px ${s.color}66`,
                }} />
              </div>
              <span className="num text-right text-ink-500">{Math.max(0, Math.round(end - start))} ms</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-ink-500">Bars show when each task actually ran, measured by the server (whole run about {Math.round(total)} ms).</p>
    </div>
  );
}

function Value({ v }) {
  if (v == null) return <span className="text-ink-500">—</span>;
  if (typeof v === 'object') return <code className="block whitespace-pre-wrap break-words text-[11px] text-ink-700">{JSON.stringify(v, null, 1)}</code>;
  return <span>{String(v)}</span>;
}

const SAID = { proposal: 'Proposal', concern: 'Concern', decision: 'Decision' };

export function TaskDetails({ task, byId, messages = [], conversationLink = null }) {
  if (!task) return <p className="text-sm text-ink-500">Select an agent in the workflow to see what it did.</p>;
  const said = messages.filter((m) => m.step === task.id);
  const s = STATUS[task.status] || STATUS.idle;
  const name = (id) => byId[id]?.label || id;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="m-label">Agent</p>
        <h3 className="type-semiwide text-lg font-bold">{task.label}</h3>
        <p className="text-ink-600">{task.task}</p>
        <p className="mt-1 inline-flex items-center gap-2"><span className="status-dot" style={{ background: s.color }} />{s.label}
          {task.duration_ms != null && <span className="num text-ink-500">· {task.duration_ms} ms</span>}
          {task.retries > 0 && <span className="text-[#F5B841]">· {task.retries} retr{task.retries > 1 ? 'ies' : 'y'}</span>}
        </p>
        {task.note && <p className="mt-1 text-ink-600">{task.note}</p>}
      </div>
      {task.contribution && (
        <div><p className="m-label">Contribution</p><p className="mt-1">{task.contribution}</p></div>
      )}
      {said.length > 0 && (
        <div>
          <p className="m-label">What it said in the conversation</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {said.map((m) => (
              <li key={m.id}>
                <span className="font-semibold">{SAID[m.type]}:</span> {m.summary}
                {conversationLink && <> <a href={`${conversationLink}#msg-${m.id}`} className="text-[#4CC9F0] underline">in context</a></>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-ink-500">Started by</dt><dd>{task.initiated_by === 'user' ? 'You' : name(task.initiated_by)}</dd>
        <dt className="text-ink-500">Depends on</dt><dd>{task.depends_on?.length ? task.depends_on.map(name).join(', ') : 'nothing'}</dd>
        <dt className="text-ink-500">Queued</dt><dd className="num">{task.queued_at?.slice(11, 23) || '—'} UTC</dd>
        <dt className="text-ink-500">Started</dt><dd className="num">{task.started_at?.slice(11, 23) || '—'}</dd>
        <dt className="text-ink-500">Finished</dt><dd className="num">{task.ended_at?.slice(11, 23) || '—'}</dd>
      </dl>
      {task.inputs && Object.keys(task.inputs).length > 0 && (
        <div><p className="m-label">Inputs</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {Object.entries(task.inputs).map(([k, v]) => <Fragment key={k}><dt className="text-ink-500">{k}</dt><dd><Value v={v} /></dd></Fragment>)}
          </dl>
        </div>
      )}
      {task.outputs && Object.keys(task.outputs).length > 0 && (
        <div><p className="m-label">Outputs</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {Object.entries(task.outputs).map(([k, v]) => <Fragment key={k}><dt className="text-ink-500">{k}</dt><dd><Value v={v} /></dd></Fragment>)}
          </dl>
        </div>
      )}
      <div>
        <p className="m-label">Tool calls ({task.tool_calls?.length || 0})</p>
        {task.tool_calls?.length ? (
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {task.tool_calls.map((c, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className={c.ok ? 'text-[#3DDC97]' : 'text-[#FF6B5B]'}>{c.ok ? '✓' : '✗'}</span>
                <code className="text-ink">{c.name}</code>
                <span className="num text-ink-500">{c.ms} ms</span>
                {c.detail && <span className="w-full pl-5 text-ink-600">{c.detail}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-500">None.</p>}
      </div>
      {task.errors?.length > 0 && (
        <div><p className="m-label">Errors</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-[#FF8A75]">{task.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function EventLog({ events, byId }) {
  if (!events?.length) return null;
  return (
    <ol className="max-h-72 overflow-y-auto font-mono text-[11px] leading-5 text-ink-600" tabIndex={0} aria-label="Execution events">
      {events.map((e, i) => (
        <li key={i}>
          <span className="num text-ink-500">+{e.ms} ms</span>{' '}
          <span className="text-ink-700">{e.task ? byId[e.task]?.label || e.task : 'orchestrator'}</span>{' '}
          <span style={{ color: (STATUS[e.type] || {}).color || '#A7B4BB' }}>{e.type}</span>
          {e.tool && <> {e.tool.name} {e.tool.ok ? 'ok' : 'failed'} ({e.tool.ms} ms)</>}
          {e.reason && <> — {e.reason}</>}
          {e.error && <> — {e.error}</>}
          {typeof e.message === 'string' && <> — {e.message}</>}
          {e.message && typeof e.message === 'object' && <> — {e.message.type}: {e.message.summary}</>}
        </li>
      ))}
    </ol>
  );
}
