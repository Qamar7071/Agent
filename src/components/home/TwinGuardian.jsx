// Home: test the trip before you take it. Travel Twin (what-ifs on a copy) and the Journey
// Guardian (a day-by-day risk check). The pictures are labelled example screens; the Twin's is a
// hypothetical scenario and the Guardian's score is a heuristic, and both say so.
import { ArrowRight, CloudSnow, FlaskConical, Mountain, ShieldAlert, Signpost, Sunset } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import DataBadge from '../ui/DataBadge.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

// From a real Guardian check of the demo trip (no live forecast that day, so confidence was low).
const DAYS = [
  { day: 1, label: 'Karimabad & the forts', score: 5, cat: 'Low' },
  { day: 2, label: 'Eagle’s Nest & viewpoints', score: 0, cat: 'Low' },
  { day: 3, label: 'Karimabad → Sost', score: 5, cat: 'Low' },
  { day: 4, label: 'Up to Khunjerab', score: 15, cat: 'Low' },
  { day: 5, label: 'Sost → Gilgit', score: 5, cat: 'Low' },
];
const COLOR = { Low: '#3DDC97', Moderate: '#F5B841', High: '#FF6B5B' };

function TwinPanel() {
  return (
    <Reveal as="article" className="m-card flex min-w-0 flex-col p-5 sm:p-7" aria-labelledby="t-twin">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A78BFA]/15 text-[#C4B5FD]" aria-hidden="true"><FlaskConical size={22} /></span>
        <DataBadge kind="scenario" label="What-ifs" />
      </div>
      <h3 id="t-twin" className="type-wide mt-5 text-2xl font-extrabold">Travel Twin</h3>
      <p className="mt-2 text-ink-600">
        A copy of your trip you can break on purpose. Close a road, add snow, cut the budget or add a day: the affected agents
        re-plan the copy and compare it with your original, side by side. Your plan changes only if you accept.
      </p>
      <figure className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4" aria-label="Example of a Travel Twin comparison">
        <p className="text-sm font-semibold text-[#C4B5FD]">“What if the Khunjerab route is unavailable on day 4?”</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-white/10 p-3">
            <p className="m-label">Original</p>
            <p className="mt-1 font-semibold">Day 4: Up to Khunjerab</p>
            <p className="text-xs text-ink-500">4,693 m, from Sost</p>
          </div>
          <div className="rounded-xl border border-[#A78BFA]/40 bg-[#A78BFA]/[0.07] p-3">
            <p className="m-label text-[#C4B5FD]">Scenario</p>
            <p className="mt-1 font-semibold">Day 4: Free day in Hunza</p>
            <p className="text-xs text-ink-500">skips Khunjerab Pass</p>
          </div>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <li className="rounded-lg bg-white/5 py-2"><span className="block text-ink-500">On the road</span><span className="num font-bold text-[#3DDC97]">−9.5 h</span></li>
          <li className="rounded-lg bg-white/5 py-2"><span className="block text-ink-500">Cost</span><span className="num font-bold text-[#F5B841]">+Rs 36,100</span></li>
          <li className="rounded-lg bg-white/5 py-2"><span className="block text-ink-500">Risk score</span><span className="num font-bold text-[#3DDC97]">15 → 5</span></li>
        </ul>
        <p className="mt-2 text-xs text-ink-600">Trade-off: less driving and lower risk, but the extra nights in Hunza cost more than Sost.</p>
        <figcaption className="mt-3 text-xs text-ink-500">From a Twin run of the demo trip (5 days from Gilgit, 4 people). A hypothetical scenario, not a road report.</figcaption>
      </figure>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/twin?demo=1" className="btn bg-[#A78BFA] text-[#120B24] hover:bg-[#C4B5FD]">Try the demo trip <ArrowRight size={16} aria-hidden="true" /></Link>
        <Link to="/twin" className="btn-ghost">Open Travel Twin</Link>
      </div>
    </Reveal>
  );
}

function GuardianPanel() {
  return (
    <Reveal as="article" delay={90} className="m-card flex min-w-0 flex-col p-5 sm:p-7" aria-labelledby="t-guardian">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3DDC97]/15 text-[#3DDC97]" aria-hidden="true"><ShieldAlert size={22} /></span>
        <DataBadge kind="heuristic" label="Informational estimate" />
      </div>
      <h3 id="t-guardian" className="type-wide mt-5 text-2xl font-extrabold">Journey Guardian</h3>
      <p className="mt-2 text-ink-600">
        Before each day, Guardian re-checks the forecast, official alerts, altitude, drive length and daylight, scores each
        day’s risk from documented factors, and tells you what changed since your last check, in plain words.
      </p>
      <figure className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4" aria-label="Example of a Guardian check">
        <ul className="flex flex-col gap-2">
          {DAYS.map((d) => (
            <li key={d.day} className="grid grid-cols-[3.2rem_1fr_4rem] items-center gap-2 text-xs">
              <span className="font-semibold text-ink-700" title={d.label}>Day {d.day}</span>
              <span className="relative h-2 rounded-full bg-white/5"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, d.score)}%`, background: COLOR[d.cat] }} /></span>
              <span className="num text-right font-semibold" style={{ color: COLOR[d.cat] }}>{d.cat} {d.score}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-ink-700">
          <span className="font-semibold text-ink">Day 4, up to Khunjerab: 15 of 100.</span> High altitude (4,693 m) +10, winter
          conditions +5. Each point names its evidence and source.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-700">
          <li className="flex items-center gap-1.5"><CloudSnow size={14} className="text-[#4CC9F0]" aria-hidden="true" /> Weather and alerts</li>
          <li className="flex items-center gap-1.5"><Mountain size={14} className="text-[#F5B841]" aria-hidden="true" /> Altitude</li>
          <li className="flex items-center gap-1.5"><Signpost size={14} className="text-[#FF6B5B]" aria-hidden="true" /> Road uncertainty</li>
          <li className="flex items-center gap-1.5"><Sunset size={14} className="text-[#A78BFA]" aria-hidden="true" /> Daylight and drive length</li>
        </ul>
        <figcaption className="mt-3 text-xs text-ink-500">From a Guardian check of the demo trip without a live forecast (confidence: low). A heuristic, not an official safety assessment.</figcaption>
      </figure>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/guardian" className="btn bg-[#3DDC97] text-[#06140F] hover:bg-[#6BE7B2]">Check a trip <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </Reveal>
  );
}

export default function TwinGuardian() {
  return (
    <section aria-labelledby="tg-title" className="mission on-dark py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="tg-title" eyebrow="Test it before you go" title="Rehearse the trip. Then keep watch over it.">
            Mountain plans meet closed roads, early snow and long days. Raahi lets you test those on a copy first, then checks
            each day again as your dates come closer, always saying what it knows and what it can’t.
          </SectionHeader>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <TwinPanel />
          <GuardianPanel />
        </div>
      </div>
    </section>
  );
}
