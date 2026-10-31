// Budget pace at a glance: how much has gone, where the plan expected to be by tonight, and what is
// left per day. Without a budget it only keeps the count.
import { pkr } from '../../lib/format.js';
import { StatusChip, TONE } from './bits.jsx';

export default function PaceCard({ p, s, onAddBudget }) {
  if (!p.budgetTotal) {
    return (
      <section aria-labelledby="pace-h" className="panel p-4 sm:p-5">
        <h2 id="pace-h" className="text-sm font-semibold text-ink-600">{s.spentSoFar}</h2>
        <p className="num mt-1 text-3xl font-extrabold">{pkr(p.spentAll)}</p>
        <p className="mt-2 text-sm text-ink-600">{s.noBudget}</p>
        <button type="button" className="btn-outline mt-3" onClick={onAddBudget}>{s.addBudget}</button>
      </section>
    );
  }
  const tone = TONE[p.status] || TONE.on_track;
  const spentW = Math.min(100, (p.spentAll / p.budgetTotal) * 100);
  const planX = Math.min(100, p.plannedPct || 0);
  const label = `${s.spentSoFar}: ${pkr(p.spentAll)} / ${pkr(p.budgetTotal)}. ${s.planExpects(pkr(p.plannedToDate))}.`;
  return (
    <section aria-labelledby="pace-h" className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="pace-h" className="text-sm font-semibold text-ink-600">{s.spentSoFar}</h2>
          <p className="num mt-0.5 text-3xl font-extrabold leading-tight">
            {pkr(p.spentAll)} <span className="text-base font-semibold text-ink-500">/ {pkr(p.budgetTotal)}</span>
          </p>
        </div>
        {p.dayIndex >= 1 && <StatusChip status={p.status} label={s.status[p.status]} />}
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-limestone-300" role="img" aria-label={label}>
        <div className={`h-3 rounded-full ${tone.bar}`} style={{ width: `${spentW}%` }} />
        {p.dayIndex >= 1 && (
          <div className="absolute -top-1.5 h-6 w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${planX}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-ink-600">
        {p.dayIndex >= 1 && <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-ink" aria-hidden="true" />{s.planExpects(pkr(p.plannedToDate))}</span>}
        <span className="num font-semibold text-ink">{s.budgetLeft(pkr(Math.max(0, p.remaining)))}{p.perDayLeft != null && p.daysLeft > 0 ? `, ${s.perDayLeft(pkr(Math.max(0, p.perDayLeft)), p.daysLeft)}` : ''}</span>
      </div>
      {p.prepaidFuture > 0 && <p className="mt-2 text-sm text-ink-600">{s.prepaidNote(pkr(p.prepaidFuture))}</p>}
      <p className="mt-3 text-xs text-ink-500">{s.paceHow}</p>
    </section>
  );
}
