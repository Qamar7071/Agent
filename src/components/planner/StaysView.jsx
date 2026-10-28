import { pkr, plural } from '../../lib/format.js';

export default function StaysView({ stays }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-ink-600">
        Where you sleep each night, with indicative price ranges from Raahi’s guide. These are not quotes and say nothing
        about availability: confirm with the property before you pay.
      </p>
      <ul className="flex flex-col gap-5">
        {stays.map((s) => (
          <li key={s.hub} className="rounded border border-limestone-300 bg-paper p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="type-semiwide text-lg font-bold">{s.name}</h3>
              <span className="text-sm text-ink-600">{plural(s.nights, 'night')}</span>
            </div>
            {s.note && <p className="mt-1 text-sm text-ink-700">{s.note}</p>}
            <p className="mt-1 text-xs text-ink-500">
              The budget uses <span className="num">{pkr(s.budget_rate.amount)}</span> per room per night ({s.budget_rate.source}).
            </p>
            {s.options?.length > 0 && (
              <ul className="mt-3 divide-y divide-limestone-300 text-sm">
                {s.options.map((o) => (
                  <li key={o.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                    <span>
                      <span className="font-medium">{o.name}</span>
                      <span className="ml-2 text-xs text-ink-500">{o.tier}</span>
                    </span>
                    <span className="num text-ink-700">
                      {o.to ? `${pkr(o.from)}–${o.to.toLocaleString('en-US')}` : 'Arranged by your operator'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {s.price_note && <p className="mt-2 text-xs text-ink-500">{s.price_note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
