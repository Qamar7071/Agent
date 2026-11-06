// Shows the current toast from lib/toast.js. Announced politely to screen readers.
import { useEffect, useState } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';
import { dismiss, subscribe } from '../../lib/toast.js';

export default function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => subscribe(setT), []);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] h-0">
      {t && (
        <div key={t.id} style={{ bottom: t.bottom ?? 24 }} className="pointer-events-auto absolute left-1/2 flex w-[min(92vw,28rem)] animate-toastIn items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-paper shadow-float">
          {t.tone === 'info' ? <Info size={18} className="shrink-0 text-apricot-300" aria-hidden="true" />
            : <CheckCircle2 size={18} className="shrink-0 text-apricot-300" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.undo && (
            <button type="button" className="min-h-[40px] shrink-0 rounded-md px-2 font-bold text-apricot-300 underline underline-offset-2 hover:bg-white/10"
              onClick={() => { t.undo(); dismiss(); }}>{t.undoLabel || 'Undo'}</button>
          )}
          <button type="button" onClick={dismiss} aria-label={t.dismissLabel || 'Dismiss'} className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-paper/70 hover:bg-white/10 hover:text-paper">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
