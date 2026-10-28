import { usePlanner } from '../../context/PlannerContext.jsx';
import { pkr } from '../../lib/format.js';

const STATUS = {
  within: 'text-juniper-600',
  tight: 'text-ochre',
  over: 'text-brick',
  no_budget: 'text-ink-600',
};

export default function BudgetView({ budget }) {
  const { applyChanges, planBusy } = usePlanner();
  const c = budget.comparison || {};
  const apply = (s) => {
    const changes = Object.entries(s.change).map(([field, value]) => ({ op: 'set', field, value }));
    applyChanges(changes, `Applied a saving: ${s.label.toLowerCase()}.`);
  };
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p className="text-sm text-ink-600">Estimated total</p>
          <p className="type-wide num text-4xl font-extrabold text-juniper">{pkr(budget.total)}</p>
          <p className="num text-sm text-ink-600">About {pkr(budget.per_person)} per person, for {budget.travellers.adults} adult{budget.travellers.adults === 1 ? '' : 's'}{budget.travellers.children ? ` and ${budget.travellers.children} child${budget.travellers.children === 1 ? '' : 'ren'}` : ''}</p>
        </div>
        <p className={`text-[15px] font-semibold sm:pb-1 ${STATUS[c.status] || ''}`}>{c.message}</p>
      </div>

      {budget.savings?.length > 0 && (
        <div>
          <h3 className="text-base font-bold">Ways to bring it down</h3>
          <ul className="mt-2 flex flex-col divide-y divide-limestone-300 rounded border border-limestone-300 bg-paper">
            {budget.savings.map((s) => (
              <li key={s.label} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>{s.label}: <span className="num font-semibold">saves about {pkr(s.saves_pkr)}</span></span>
                <button type="button" disabled={planBusy} onClick={() => apply(s)} className="btn-outline min-h-[38px]">Apply</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Focusable so keyboard users can scroll the table sideways on a phone. */}
      <div className="overflow-x-auto" role="region" aria-labelledby="budget-table-caption" tabIndex={0}>
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <caption id="budget-table-caption" className="mb-2 text-left text-base font-bold text-ink">How the estimate is worked out</caption>
          <thead>
            <tr className="border-b-2 border-juniper">
              <th scope="col" className="py-2 pr-3 font-semibold">Item</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Worked out as</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Paid</th>
              <th scope="col" className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {budget.lines.map((l) => (
              <tr key={l.id} className="border-b border-limestone-300 align-top">
                <th scope="row" className="py-2.5 pr-3 font-medium">
                  {l.label}
                  {l.note && <span className="block text-xs font-normal text-ink-500">{l.note}</span>}
                </th>
                <td className="num py-2.5 pr-3 text-ink-700">{l.quantity}</td>
                <td className="py-2.5 pr-3 text-ink-700">{l.basis === 'per person' ? 'Per person' : 'Shared by the group'}, {l.frequency}</td>
                <td className="num py-2.5 text-right font-semibold">{pkr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="py-3 pr-3 text-right font-bold">Total (estimate)</th>
              <td className="num py-3 text-right text-base font-bold">{pkr(budget.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-base font-bold">Assumptions</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-700">
            {budget.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-base font-bold">Not included</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-700">
            {budget.not_included.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      </div>
      <p className="text-sm text-ink-600">{budget.note}</p>
    </div>
  );
}
