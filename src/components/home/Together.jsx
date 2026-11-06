// Home: travelling together. The Group Room before the trip and Safar Saathi during it.
// The pictures are labelled examples of those screens, not anyone's real trip.
import { CloudOff, Languages, Lock, Plus, Sparkles, Users, Vote, Wallet } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import Avatar from '../ui/Avatar.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

const PEOPLE = ['Ayesha', 'Bilal', 'Sara', 'Hamza'];
const STEPS = ['Invite', 'Answer', 'Options', 'Vote', 'Confirm'];

function GroupPanel() {
  return (
    <Reveal as="article" className="card flex min-w-0 flex-col p-5 sm:p-7" aria-labelledby="t-group">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-juniper text-on-juniper shadow-card" aria-hidden="true"><Users size={22} /></span>
      <p className="eyebrow mt-5">Group travel</p>
      <h3 id="t-group" className="type-wide mt-2 text-2xl font-extrabold">Group Room</h3>
      <p className="mt-2 text-ink-600">
        Share one link. Friends join with just a name, everyone answers in a minute, the agents suggest plans the whole group
        can live with and say what each one gives up. You vote; the organizer confirms.
      </p>
      <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-semibold" aria-label="Steps">
        {STEPS.map((st, i) => (
          <li key={st} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-juniper-50 px-2.5 py-1 text-juniper-700"><span className="num">{i + 1}</span>{st}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="text-ink-500">→</span>}
          </li>
        ))}
      </ol>
      <figure className="mt-5 rounded-2xl border border-limestone-300 bg-limestone/60 p-4" aria-label="Example of a Group Room">
        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">{PEOPLE.map((n) => <Avatar key={n} name={n} size={30} ring />)}</span>
          <span className="text-sm text-ink-600">4 joined, 4 answered</span>
        </div>
        <ul className="mt-3 flex flex-col gap-2.5 text-sm">
          {[['A', 'Everyone’s answers combined', 76, 1, false], ['B', 'Gentler and lower', 89, 3, true]].map(([id, label, match, votes, pick]) => (
            <li key={id} className={`flex items-center gap-3 rounded-xl bg-paper p-2.5 ${pick ? 'ring-1 ring-juniper' : ''}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${pick ? 'bg-juniper text-on-juniper' : 'bg-limestone-300'}`} aria-hidden="true">{id}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{label}</span>
                  <span className="num shrink-0 font-bold text-juniper-700">{match}<span className="text-xs font-semibold text-ink-500">/100</span></span>
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-limestone-300"><span className="block h-full rounded-full bg-juniper-600" style={{ width: `${match}%` }} /></span>
                <span className="mt-1 flex items-center gap-1 text-xs text-ink-600"><Vote size={12} aria-hidden="true" /> {votes} {votes === 1 ? 'vote' : 'votes'}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-600"><Lock size={13} aria-hidden="true" /> 1 member needs a gentle climb. No name is shown.</p>
        <figcaption className="mt-2 text-xs text-ink-500">Example screen</figcaption>
      </figure>
      <Link to="/g/new" className="btn-primary mt-6 self-start">Start a group trip</Link>
    </Reveal>
  );
}

function SaathiPanel() {
  return (
    <Reveal as="article" delay={90} className="card flex min-w-0 flex-col p-5 sm:p-7" aria-labelledby="t-saathi">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-apricot text-juniper-950 shadow-card" aria-hidden="true"><Wallet size={22} /></span>
      <p className="eyebrow mt-5">On the road</p>
      <h3 id="t-saathi" className="type-wide mt-2 text-2xl font-extrabold">Safar Saathi</h3>
      <p className="mt-2 text-ink-600">
        Your trip companion: add spending in three taps, see if the group is on pace for the budget, get a friendly early
        warning with costed choices, and settle up with the fewest payments.
      </p>
      <ul className="mt-4 flex flex-wrap gap-1.5 text-xs font-semibold">
        <li className="inline-flex items-center gap-1.5 rounded-full bg-ochre-50 px-2.5 py-1 text-ochre-700"><Plus size={12} aria-hidden="true" /> 3-tap expenses</li>
        <li className="inline-flex items-center gap-1.5 rounded-full bg-ochre-50 px-2.5 py-1 text-ochre-700"><CloudOff size={12} aria-hidden="true" /> Works offline</li>
        <li className="inline-flex items-center gap-1.5 rounded-full bg-ochre-50 px-2.5 py-1 text-ochre-700"><Languages size={12} aria-hidden="true" /> Roman Urdu</li>
      </ul>
      <figure className="mt-5 rounded-2xl border border-limestone-300 bg-limestone/60 p-4" aria-label="Example of Safar Saathi">
        <p className="text-sm text-ink-600">Day 3 of 6 · spent so far</p>
        <p className="num mt-0.5 text-2xl font-extrabold">Rs 61,400 <span className="text-base font-semibold text-ink-500">of Rs 1,50,000</span></p>
        <div className="relative mt-3 h-2.5 rounded-full bg-limestone-300" aria-hidden="true">
          <div className="h-full rounded-full bg-juniper-600" style={{ width: '41%' }} />
          <span className="absolute -top-1 w-1 rounded bg-ink" style={{ left: '44%', height: 18 }} />
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-juniper-50 px-2.5 py-0.5 text-xs font-semibold text-juniper-700">
          <Sparkles size={12} aria-hidden="true" /> On track
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {['Khana', 'Rehaish', 'Safar'].map((c) => <span key={c} className="rounded-lg bg-paper py-2 text-center text-xs font-semibold text-ink-700">{c}</span>)}
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm"><Avatar name="Bilal" size={24} /> Bilal pays Sara Rs 2,150 to settle up</p>
        <figcaption className="mt-2 text-xs text-ink-500">Example screen</figcaption>
      </figure>
      <Link to="/plan" className="btn-outline mt-6 self-start">Plan a trip, then start it</Link>
    </Reveal>
  );
}

export default function Together() {
  return (
    <section id="together" aria-labelledby="together-title" className="border-y border-limestone-300 bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="together-title" eyebrow="Travel together" title="Agree on one plan. Stay on budget on the road.">
            Most northern trips are group trips. Raahi helps the group decide before you leave and keeps the money fair while
            you travel. Agents suggest; people decide. Nothing is booked for you.
          </SectionHeader>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <GroupPanel />
          <SaathiPanel />
        </div>
      </div>
    </section>
  );
}
