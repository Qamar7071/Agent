// The agent workflow as a graph, drawn from the run's real tasks: who depends on whom (solid
// lines) and who asked whom to run again (dashed). Colours and labels follow each task's status.
import { useMemo } from 'react';

export const STATUS = {
  idle: { label: 'Idle', color: '#8D9AA2' },
  queued: { label: 'Queued', color: '#8D9AA2' },
  running: { label: 'Running', color: '#4CC9F0' },
  completed: { label: 'Completed', color: '#3DDC97' },
  failed: { label: 'Failed', color: '#FF6B5B' },
  retrying: { label: 'Retrying', color: '#F5B841' },
  waiting_for_approval: { label: 'Waiting for approval', color: '#A78BFA' },
  skipped: { label: 'Not needed', color: '#5B6870' },
};

const W = 140;
const H = 50;
const GX = 18;
const GY = 46;

function layout(tasks) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const depth = {};
  const visit = (t, seen) => {
    if (depth[t.id] != null) return depth[t.id];
    if (seen.has(t.id)) return 1;
    seen.add(t.id);
    const parents = [...(t.depends_on || []), ...(byId[t.initiated_by] && t.initiated_by !== t.id ? [t.initiated_by] : [])]
      .map((id) => byId[id]).filter(Boolean);
    const v = t.agent === 'orchestrator' ? 0 : parents.length ? 1 + Math.max(...parents.map((p) => visit(p, seen))) : 1;
    depth[t.id] = v;
    return v;
  };
  tasks.forEach((t) => visit(t, new Set()));
  const rows = [];
  tasks.forEach((t) => {
    (rows[depth[t.id]] ||= []).push(t);
  });
  const widest = Math.max(1, ...rows.map((r) => (r ? r.length : 0)));
  const width = widest * (W + GX) + GX;
  const pos = {};
  rows.forEach((row, d) => {
    if (!row) return;
    const rowW = row.length * (W + GX) - GX;
    row.forEach((t, i) => {
      pos[t.id] = { x: (width - rowW) / 2 + i * (W + GX), y: 16 + d * (H + GY) };
    });
  });
  const height = (rows.length) * (H + GY) + 10;
  return { pos, width, height, byId };
}

function edgePath(a, b) {
  const x1 = a.x + W / 2;
  const y1 = a.y + H;
  const x2 = b.x + W / 2;
  const y2 = b.y;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

export default function AgentFlow({ tasks, selected, onSelect, compact = false }) {
  const { pos, width, height, byId } = useMemo(() => layout(tasks), [tasks]);
  if (!tasks.length) return null;
  const edges = [];
  tasks.forEach((t) => {
    (t.depends_on || []).forEach((d) => byId[d] && edges.push({ from: d, to: t.id, kind: 'data' }));
    if (byId[t.initiated_by] && byId[t.initiated_by].agent !== 'orchestrator') {
      edges.push({ from: t.initiated_by, to: t.id, kind: 'request' });
    } else if (byId[t.initiated_by] && !(t.depends_on || []).length) {
      edges.push({ from: t.initiated_by, to: t.id, kind: 'delegate' });
    }
  });
  const done = tasks.filter((t) => ['completed', 'skipped', 'waiting_for_approval'].includes(t.status)).length;
  return (
    <figure className="m-0">
      <div className="no-scrollbar overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} width={compact ? '100%' : Math.max(width, 320)} className="block max-w-none"
          style={compact ? undefined : { minWidth: Math.min(width, 980) }} role="group" aria-label="Agent workflow">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.35)" />
            </marker>
            <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {edges.map((e, i) => (
            <path key={i} d={edgePath(pos[e.from], pos[e.to])} fill="none" markerEnd="url(#arrow)"
              stroke={e.kind === 'request' ? '#A78BFA' : e.kind === 'delegate' ? 'rgba(255,255,255,0.14)' : 'rgba(76,201,240,0.45)'}
              strokeWidth={e.kind === 'request' ? 1.6 : 1.2} strokeDasharray={e.kind === 'request' ? '5 4' : undefined} />
          ))}
          {tasks.map((t) => {
            const p = pos[t.id];
            const s = STATUS[t.status] || STATUS.idle;
            const sel = selected === t.id;
            const label = t.label.length > 22 ? `${t.label.slice(0, 21)}…` : t.label;
            const meta = t.status === 'running' ? 'Running…' : t.duration_ms != null ? `${s.label} · ${t.duration_ms} ms` : s.label;
            return (
              <g key={t.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0}
                aria-label={`${t.label}: ${s.label}${t.duration_ms != null ? `, ${t.duration_ms} milliseconds` : ''}. Show details`}
                aria-pressed={sel} onClick={() => onSelect?.(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(t.id); } }}
                className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[#F2C27F] [&:focus-visible>rect:first-child]:stroke-[3]">
                <rect width={W} height={H} rx="10" fill={t.status === 'skipped' ? 'rgba(255,255,255,0.02)' : 'rgba(10,17,22,0.92)'}
                  stroke={sel ? '#F2C27F' : s.color} strokeOpacity={t.status === 'skipped' ? 0.35 : 0.9} strokeWidth={sel ? 2.4 : 1.4}
                  filter={t.status === 'running' ? 'url(#nodeGlow)' : undefined} className={t.status === 'running' ? 'animate-pulse' : undefined} />
                <circle cx="13" cy="17" r="4" fill={s.color} />
                <text x="23" y="21" fill={t.status === 'skipped' ? '#8D9AA2' : '#E6EDF0'} fontSize="11.5" fontWeight="600">{label}</text>
                <text x="12" y="38" fill="#A7B4BB" fontSize="10">{meta}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span className="num">{done}/{tasks.length} tasks finished</span>
        {Object.entries(STATUS).filter(([k]) => tasks.some((t) => t.status === k)).map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="status-dot" style={{ background: s.color }} />{s.label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="#A78BFA" strokeDasharray="5 4" strokeWidth="1.6" /></svg>asked to run again</span>
      </figcaption>
    </figure>
  );
}
