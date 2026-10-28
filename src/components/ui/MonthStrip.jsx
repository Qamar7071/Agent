import { MONTHS, MONTHS_SHORT, monthSpan } from '../../lib/format.js';

// Twelve cells, one per month: solid when a place is usually at its best, hatched when its
// access route is typically closed by snow. It is the typical pattern, not a live status.
export default function MonthStrip({ best = [], closed = [], selected = null, size = 'md' }) {
  const label = [
    `Usually best ${monthSpan(best)}`,
    closed.length ? `access typically closed ${closed.map((m) => MONTHS[m - 1]).join(', ')}` : null,
  ].filter(Boolean).join('; ');
  const h = size === 'sm' ? 'h-2' : 'h-3';
  return (
    <div role="img" aria-label={label} className="w-full">
      <div className="grid grid-cols-12 gap-[3px]">
        {MONTHS_SHORT.map((m, i) => {
          const month = i + 1;
          const isBest = best.includes(month);
          const isClosed = closed.includes(month);
          return (
            <span
              key={m}
              className={`${h} rounded-[2px] ${isBest ? 'bg-juniper-600' : isClosed ? 'bg-[repeating-linear-gradient(135deg,#B9BFB1_0_2px,transparent_2px_5px)]' : 'bg-limestone-300'} ${selected === month ? 'outline outline-2 outline-offset-1 outline-apricot' : ''}`}
            />
          );
        })}
      </div>
      {size !== 'sm' && (
        <div aria-hidden="true" className="mt-1 grid grid-cols-12 gap-[3px] text-center text-[10px] leading-none text-ink-500">
          {MONTHS_SHORT.map((m, i) => <span key={m} className={selected === i + 1 ? 'font-bold text-ink' : ''}>{m[0]}</span>)}
        </div>
      )}
    </div>
  );
}
