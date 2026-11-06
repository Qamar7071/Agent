// No live forecast: say why plainly, and show what usually happens this month instead,
// labelled as a typical pattern (never as a forecast).
import { CloudOff, RefreshCw } from 'lucide-react';
import { seasonNotes, seasonOf } from '../../lib/data.js';
import { MONTHS } from '../../lib/format.js';
import DataBadge from '../ui/DataBadge.jsx';

export default function NoForecast({ reason, onRetry, month = new Date().getMonth() + 1, note = null }) {
  return (
    <div className="rounded-xl border border-dashed border-limestone-400 bg-limestone/50 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-ink"><CloudOff size={16} className="text-ink-600" aria-hidden="true" /> No live forecast right now</p>
      {reason && <p className="mt-1 text-ink-600">{reason}</p>}
      <div className="mt-3 rounded-lg bg-paper p-3">
        <DataBadge kind="typical" />
        <p className="mt-2 text-ink-700"><span className="font-semibold">What usually happens in {MONTHS[month - 1]}:</span> {note || seasonNotes[seasonOf(month)]}</p>
      </div>
      {onRetry && <button type="button" onClick={onRetry} className="btn-outline mt-3 min-h-[40px]"><RefreshCw size={15} aria-hidden="true" /> Try again</button>}
    </div>
  );
}
