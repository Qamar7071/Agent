// Home: "Meet your AI travel agents". The roster, the stages and the messages all come from a
// real recorded run of Raahi's agents (src/data/demo-run.json), clearly labelled as recorded.
// Nothing here is a mock-up: the agent names, what each does, the timings and the words are the
// server's own.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessagesSquare, Workflow } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { RECORDED, answers, finalDecision, messagesOf } from '../../lib/decided.js';
import { decidedStrings } from '../../lib/decidedI18n.js';
import { duration } from '../../lib/pipeline.js';
import Conversation from '../decided/Conversation.jsx';
import AgentPipeline from '../mission/AgentPipeline.jsx';
import { AgentAvatar } from '../ui/AgentAvatar.jsx';
import DataBadge from '../ui/DataBadge.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

const s = decidedStrings('en');

/** A short thread from the run: a concern, the reply that answers it, and the final decision. */
function excerpt(run) {
  const msgs = messagesOf(run);
  const replies = answers(msgs);
  const concern = msgs.find((m) => m.type === 'concern' && replies[m.id]);
  const reply = concern && msgs.find((m) => m.id === replies[concern.id][0]);
  const decision = finalDecision(msgs);
  return [...new Map([concern, reply, decision].filter(Boolean).map((m) => [m.id, m])).values()];
}

function useRecorded(ref) {
  const [rec, setRec] = useState(null);
  useEffect(() => {
    let off = false;
    const load = () => import('../../data/demo-run.json').then((m) => !off && setRec(m.default)).catch(() => {});
    if (!('IntersectionObserver' in window)) { load(); return () => { off = true; }; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { load(); io.disconnect(); } }, { rootMargin: '400px' });
    if (ref.current) io.observe(ref.current);
    return () => { off = true; io.disconnect(); };
  }, [ref]);
  return rec;
}

export default function AgentShowcase() {
  const ref = useRef(null);
  const rec = useRecorded(ref);
  const run = rec?.run;
  const tasks = run?.tasks || [];
  const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const msgs = run ? excerpt(run) : [];
  const when = rec ? new Date(rec.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <section ref={ref} id="agents" aria-labelledby="agents-title" className="on-dark topo relative overflow-hidden bg-juniper-950 py-16 text-white [--topo-opacity:0.06] sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="agents-title" eyebrow="Meet your AI travel agents" title="Twelve specialists. One honest answer."
            action={<Link to="/agents" className="btn-accent"><Workflow size={16} aria-hidden="true" /> Open the Agent Control Center</Link>}>
            A Master Orchestrator reads your request and hands it to the specialists it needs. Independent agents work in
            parallel, Validation cross-checks them all, and decisions that are yours to make come back to you.
          </SectionHeader>
        </Reveal>

        <ul className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="The agents">
          {(tasks.length ? tasks : Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` }))).map((t, i) => (
            <Reveal as="li" key={t.id} delay={(i % 4) * 60}
              className="flex min-h-[7.5rem] gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.07]">
              {t.agent ? (
                <>
                  <AgentAvatar agent={t.agent} label={t.label} size={42} />
                  <div className="min-w-0">
                    <h3 className="font-bold leading-snug">{t.label}</h3>
                    <p className="mt-1 text-sm leading-snug text-white/70">{t.task}</p>
                    {t.duration_ms != null && <p className="num mt-1.5 text-xs text-apricot-300">{duration(t.duration_ms)} in the recorded run</p>}
                  </div>
                </>
              ) : <span className="h-full w-full animate-pulse rounded-xl bg-white/5" aria-hidden="true" />}
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-10 rounded-3xl bg-limestone p-5 text-ink shadow-float sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="type-semiwide text-xl font-bold">How a request flows through them</h3>
            <DataBadge kind="recorded" />
          </div>
          {rec && <p className="mt-1 text-sm text-ink-600"><span className="font-semibold text-ink-700">Request:</span> {rec.message}</p>}
          <div className="mt-5">
            {tasks.length ? <AgentPipeline tasks={tasks} /> : <div className="skeleton h-64" aria-hidden="true" />}
          </div>
          <p className="mt-3 text-xs text-ink-600">
            A real run recorded on {when || '…'}, shown as it happened, including the slow step: places to stay waited on
            OpenStreetMap. Live runs show the same view in the Agent Control Center.
          </p>
        </Reveal>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Reveal className="min-w-0 rounded-3xl bg-limestone p-5 text-ink shadow-float sm:p-7">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-juniper text-on-juniper" aria-hidden="true"><MessagesSquare size={20} /></span>
              <div>
                <h3 className="type-semiwide text-xl font-bold">See how they decided</h3>
                <p className="mt-0.5 text-sm text-ink-600">Three messages from the same recorded run: a concern, the answer to it, and the decision.</p>
              </div>
            </div>
            <div className="mt-5">
              {msgs.length ? <Conversation messages={msgs} s={s} tasksById={tasksById} runId={RECORDED} linkSteps={false} />
                : <div className="skeleton h-72" aria-hidden="true" />}
            </div>
          </Reveal>
          <Reveal delay={100} className="flex min-w-0 flex-col justify-between gap-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
            <div>
              <h3 className="text-lg font-bold">For every recommendation, you can see</h3>
              <ul className="mt-4 flex flex-col gap-3 text-sm text-white/85">
                {[['What was recommended', 'and which agent suggested it'], ['Why', 'in a sentence, with the evidence and its source'],
                  ['What worried it', 'and which agent answered the concern'], ['What you decide', 'when a choice is yours: over budget, too few days']].map(([a, b]) => (
                  <li key={a} className="flex gap-3"><span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-apricot" /><span><span className="font-semibold text-white">{a}</span> {b}</span></li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-white/60">Summaries of each agent’s real result, not the model’s private reasoning.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/decided?run=${RECORDED}`} className="btn-accent">Watch the whole run <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link to="/agents" className="btn-ghost">Run the agents live</Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
