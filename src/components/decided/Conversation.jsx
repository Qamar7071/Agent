// The agents' conversation for one run: each message with its agent, type, reason, evidence,
// the earlier message it answers and a link to its real step in the Agent Control Center.
import {
  BadgeCheck, BedDouble, Backpack, Brain, CloudSun, Compass, Copy, CornerDownRight, Leaf, Network, Route, Scale,
  ShieldAlert, ShieldCheck, Signpost, Users, Wallet,
} from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { agentName, answers as answersOf, stepLink } from '../../lib/decided.js';

const LOOK = {
  orchestrator: [Network, 'bg-juniper-100 text-juniper-700'],
  memory: [Brain, 'bg-lake-100 text-lake-700'],
  research: [Compass, 'bg-lake-100 text-lake-700'],
  itinerary: [Route, 'bg-apricot-100 text-ochre-700'],
  route: [Signpost, 'bg-apricot-100 text-ochre-700'],
  weather: [CloudSun, 'bg-lake-100 text-lake-700'],
  budget: [Wallet, 'bg-ochre-100 text-ochre-700'],
  accommodation: [BedDouble, 'bg-ochre-100 text-ochre-700'],
  safety: [ShieldCheck, 'bg-brick-50 text-brick'],
  guardian: [ShieldAlert, 'bg-brick-50 text-brick'],
  packing: [Backpack, 'bg-juniper-100 text-juniper-700'],
  eco: [Leaf, 'bg-juniper-100 text-juniper-700'],
  validation: [BadgeCheck, 'bg-juniper-100 text-juniper-700'],
  twin: [Copy, 'bg-limestone-300 text-ink-700'],
  comparison: [Scale, 'bg-limestone-300 text-ink-700'],
};

const TYPE_LOOK = {
  proposal: { chip: 'border-lake/30 bg-lake-50 text-lake-700', bubble: 'border-limestone-300' },
  concern: { chip: 'border-ochre/40 bg-ochre-50 text-ochre-700', bubble: 'border-ochre/50' },
  decision: { chip: 'border-juniper bg-juniper text-on-juniper', bubble: 'border-juniper' },
};

export function AgentAvatar({ agent, label, size = 40 }) {
  const [Icon, tone] = /consensus/i.test(label || '') ? [Users, LOOK.validation[1]] : LOOK[agent] || LOOK.orchestrator;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

const seconds = (ms) => (!Number.isFinite(ms) ? null : ms < 1000 ? `+${Math.round(ms)} ms` : `+${(ms / 1000).toFixed(1)} s`);

function Message({ m, s, tasksById, byMsg, answeredBy, at, runId, linkSteps }) {
  const name = agentName(m, tasksById);
  const look = TYPE_LOOK[m.type];
  const answered = byMsg[m.resolvesEventId];
  return (
    <li id={`msg-${m.id}`} className="flex scroll-mt-24 gap-3 rounded-lg p-1.5 target:bg-juniper-50">
      <AgentAvatar agent={m.agent} label={name} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{name}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${look.chip}`}>{s.types[m.type]}</span>
          {seconds(at) && <span className="num text-xs text-ink-500">{seconds(at)}</span>}
        </p>
        {answered && (
          <a href={`#msg-${answered.id}`} className="mt-1 flex items-start gap-1.5 border-l-2 border-limestone-400 pl-2 text-xs text-ink-600 hover:text-ink">
            <CornerDownRight size={14} className="mt-[1px] shrink-0" aria-hidden="true" />
            <span className="min-w-0"><span className="font-semibold">{s.answers(agentName(answered, tasksById))}:</span> {answered.summary}</span>
          </a>
        )}
        <div className={`mt-1.5 rounded-lg rounded-tl-sm border bg-paper px-3.5 py-2.5 ${look.bubble} ${m.type === 'decision' ? 'border-2' : ''}`}>
          <p className="break-words">{m.summary}</p>
          {m.reason && <p className="mt-1.5 break-words text-sm text-ink-600"><span className="font-semibold text-ink-700">{s.why}:</span> {m.reason}</p>}
        </div>
        {(m.evidence?.length > 0 || answeredBy || linkSteps) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            {m.evidence?.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={s.evidence}>
                {m.evidence.map((e, i) => (
                  <li key={i} className="max-w-full break-words rounded border border-limestone-300 bg-limestone/50 px-2 py-0.5 text-ink-700">
                    <span className="font-semibold">{e.source}</span>{e.detail && <>: {e.detail}</>}
                  </li>
                ))}
              </ul>
            )}
            {answeredBy && <a href={`#msg-${answeredBy}`} className="link">{s.answeredBelow}</a>}
            {linkSteps && <Link to={stepLink(runId, m.step)} className="link">{s.seeStep}</Link>}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * messages: the messages to show (already filtered for playback); all: every message of the run
 * (so "answered below" only appears once the answer is visible). working: labels of running agents.
 */
export default function Conversation({ messages, s, tasksById, offsets = {}, runId, linkSteps = true, working = [] }) {
  const byMsg = Object.fromEntries(messages.map((m) => [m.id, m]));
  const replies = answersOf(messages);
  return (
    <div role="log" aria-label={s.label}>
      <ol className="flex flex-col gap-3">
        {messages.map((m) => (
          <Message key={m.id} m={m} s={s} tasksById={tasksById} byMsg={byMsg} answeredBy={replies[m.id]?.[0]}
            at={offsets[m.id]} runId={runId} linkSteps={linkSteps} />
        ))}
      </ol>
      {working.length > 0 && (
        <p className="mt-3 flex items-center gap-2 pl-1.5 text-sm text-ink-600" role="status">
          <span className="flex -space-x-2">
            {working.slice(0, 3).map((t) => <AgentAvatar key={t.id} agent={t.agent} label={t.label} size={28} />)}
          </span>
          <span className="inline-flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-ink-500" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </span>
          <span className="min-w-0">{s.working(working.slice(0, 3).map((t) => t.label).join(', '))}</span>
        </p>
      )}
    </div>
  );
}

/** The agents who spoke in this run, as a row of avatars with their names for screen readers. */
export function Crew({ messages, tasksById, label }) {
  const seen = new Map();
  for (const m of messages) if (!seen.has(m.step)) seen.set(m.step, m);
  const crew = [...seen.values()];
  if (!crew.length) return null;
  return (
    <div className="flex items-center gap-3">
      <ul className="flex -space-x-2" aria-label={label}>
        {crew.map((m) => (
          <li key={m.step} title={agentName(m, tasksById)} className="rounded-full ring-2 ring-limestone">
            <AgentAvatar agent={m.agent} label={agentName(m, tasksById)} size={34} />
            <span className="sr-only">{agentName(m, tasksById)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DecisionCard({ decision, stats, s, tasksById, actions }) {
  return (
    <section aria-labelledby="decision-h" className="rounded-lg border-2 border-juniper bg-juniper-50 p-5">
      <h2 id="decision-h" className="text-sm font-semibold uppercase tracking-wide text-juniper-700">{s.decisionTitle}</h2>
      {decision ? (
        <div className="mt-2 flex gap-3">
          <AgentAvatar agent={decision.agent} label={agentName(decision, tasksById)} />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug">{decision.summary}</p>
            {decision.reason && <p className="mt-1 text-sm text-ink-700">{decision.reason}</p>}
          </div>
        </div>
      ) : <p className="mt-2 text-ink-700">{s.noDecision}</p>}
      <p className="num mt-3 text-sm text-ink-600">{s.stats(stats)}</p>
      <p className="mt-1 text-sm font-semibold text-ink-700">{s.humansDecide}</p>
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
