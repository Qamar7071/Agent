// Home: the three ways to use Raahi with other people and on the road. The agents' messages
// are loaded from the recorded real run (labelled as recorded); the Group Room and Safar Saathi
// pictures are labelled examples of those screens.
import { useEffect, useState } from 'react';
import { Lock, MessagesSquare, Sparkles, Users, Wallet } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { RECORDED, answers, finalDecision, messagesOf } from '../../lib/decided.js';
import { decidedStrings } from '../../lib/decidedI18n.js';
import Conversation from '../decided/Conversation.jsx';
import Avatar from '../ui/Avatar.jsx';

const s = decidedStrings('en');

/** A short thread from the run: a concern, the reply that answers it, and the final decision. */
function excerpt(run) {
  const msgs = messagesOf(run);
  const replies = answers(msgs);
  const concern = msgs.find((m) => m.type === 'concern' && replies[m.id]);
  const reply = concern && msgs.find((m) => m.id === replies[concern.id][0]);
  const decision = finalDecision(msgs);
  const picked = [concern, reply, decision].filter(Boolean);
  return [...new Map(picked.map((m) => [m.id, m])).values()];
}

function AgentsPanel() {
  const [rec, setRec] = useState(null);
  useEffect(() => {
    let off = false;
    import('../../data/demo-run.json').then((m) => !off && setRec(m.default)).catch(() => {});
    return () => { off = true; };
  }, []);
  const run = rec?.run;
  const tasksById = Object.fromEntries((run?.tasks || []).map((t) => [t.id, t]));
  const msgs = run ? excerpt(run) : [];
  return (
    <article className="rounded-lg border border-white/10 bg-limestone p-5 text-ink shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] sm:p-7 lg:row-span-2" aria-labelledby="t-agents">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-juniper text-on-juniper" aria-hidden="true"><MessagesSquare size={22} /></span>
        <div>
          <h3 id="t-agents" className="type-semiwide text-xl font-bold">See how the agents decided</h3>
          <p className="mt-1 max-w-prose text-ink-600">
            Each agent says what it found, what worries it and what it decided, with its evidence. Three messages from
            a recorded run of a real request:
          </p>
        </div>
      </div>
      {rec && (
        <>
          <p className="mt-4 rounded-md border border-limestone-300 bg-paper px-3 py-2 text-sm">
            <span className="font-semibold">Request:</span> {rec.message}
          </p>
          <div className="mt-4">
            <Conversation messages={msgs} s={s} tasksById={tasksById} runId={RECORDED} linkSteps={false} />
          </div>
        </>
      )}
      {!rec && <div className="mt-4 h-72 animate-pulse rounded-md bg-limestone-300/60" aria-hidden="true" />}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link to={`/decided?run=${RECORDED}`} className="btn-primary min-h-[48px]">Watch the whole run</Link>
        <span className="text-sm text-ink-600">Recorded on {rec ? new Date(rec.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '…'}, not live.</span>
      </div>
    </article>
  );
}

const PEOPLE = ['Ayesha', 'Bilal', 'Sara', 'Hamza'];

function GroupPanel() {
  return (
    <article className="flex flex-col rounded-lg border border-white/15 bg-white/[0.06] p-5 sm:p-6" aria-labelledby="t-group">
      <h3 id="t-group" className="type-semiwide flex items-center gap-2 text-xl font-bold"><Users size={20} aria-hidden="true" /> Plan with your group</h3>
      <p className="mt-1 text-white/80">
        Share one link. Everyone answers in a minute, the agents suggest plans the whole group can live with, you
        vote, and the organizer decides.
      </p>
      <figure className="mt-4 rounded-md bg-paper p-4 text-ink" aria-label="Example of a Group Room">
        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">{PEOPLE.map((n) => <Avatar key={n} name={n} size={30} ring />)}</span>
          <span className="text-sm text-ink-600">4 joined, 4 answered</span>
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {[['A', 'Everyone’s answers combined', 76, false], ['B', 'Gentler and lower', 89, true]].map(([id, label, match, pick]) => (
            <li key={id} className="flex items-center gap-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm font-bold ${pick ? 'bg-juniper text-on-juniper' : 'bg-limestone-300'}`} aria-hidden="true">{id}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{label}</span>
                  <span className="num shrink-0 font-bold text-juniper-700">{match}</span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-limestone-300"><span className="block h-full rounded-full bg-juniper-600" style={{ width: `${match}%` }} /></span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-600"><Lock size={13} aria-hidden="true" /> 1 member needs a gentle climb. No name is shown.</p>
        <figcaption className="mt-2 text-xs text-ink-500">Example screen</figcaption>
      </figure>
      <Link to="/g/new" className="btn mt-5 min-h-[48px] self-start bg-apricot text-[#2A1A05] hover:bg-apricot-300">Start a group trip</Link>
    </article>
  );
}

function SaathiPanel() {
  return (
    <article className="flex flex-col rounded-lg border border-white/15 bg-white/[0.06] p-5 sm:p-6" aria-labelledby="t-saathi">
      <h3 id="t-saathi" className="type-semiwide flex items-center gap-2 text-xl font-bold"><Wallet size={20} aria-hidden="true" /> Safar Saathi on the road</h3>
      <p className="mt-1 text-white/80">
        Add spending in three taps, see if you are on pace for your budget, split costs fairly and keep going
        without signal.
      </p>
      <figure className="mt-4 rounded-md bg-paper p-4 text-ink" aria-label="Example of Safar Saathi">
        <p className="text-sm text-ink-600">Day 3 of 6, spent so far</p>
        <p className="num mt-0.5 text-2xl font-extrabold">Rs 61,400 <span className="text-base font-semibold text-ink-500">of Rs 1,50,000</span></p>
        <div className="relative mt-3 h-2.5 rounded-full bg-limestone-300" aria-hidden="true">
          <div className="h-full rounded-full bg-juniper-600" style={{ width: '41%' }} />
          <span className="absolute -top-1 w-1 rounded bg-ink" style={{ left: '44%', height: 18 }} />
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-juniper-50 px-2.5 py-0.5 text-xs font-semibold text-juniper-700">
          <Sparkles size={12} aria-hidden="true" /> On track
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm"><Avatar name="Bilal" size={24} /> Bilal pays Sara Rs 2,150 to settle up</p>
        <figcaption className="mt-2 text-xs text-ink-500">Example screen</figcaption>
      </figure>
      <Link to="/plan" className="btn mt-5 min-h-[48px] self-start border border-white/40 text-white hover:bg-white/10">Plan a trip, then start it</Link>
    </article>
  );
}

export default function Together() {
  return (
    <section aria-labelledby="together-title" className="on-dark bg-juniper-950 py-16 text-white sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <h2 id="together-title" className="type-wide max-w-3xl text-3xl font-extrabold sm:text-5xl">Plan it together. See every reason.</h2>
        <p className="mt-3 max-w-prose text-white/85">
          Most northern trips are group trips. Raahi helps the group agree on one plan, stays with you on the road, and
          shows how its agents reached every suggestion. Agents suggest; people decide. Nothing is booked for you.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <AgentsPanel />
          <GroupPanel />
          <SaathiPanel />
        </div>
      </div>
    </section>
  );
}
