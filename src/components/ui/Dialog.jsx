import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// Accessible modal: labelled, traps focus, closes on Escape, returns focus where it was.
export default function Dialog({ open, onClose, title, children, footer = null, wide = false }) {
  const boxRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    const box = boxRef.current;
    const focusables = () => box?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]') || [];
    requestAnimationFrame(() => (focusables()[1] || focusables()[0])?.focus());
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-juniper-950/60" onClick={onClose} />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-lg bg-paper shadow-2xl sm:rounded-lg ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-limestone-300 px-5 py-4">
          <h2 id={titleId} className="type-semiwide text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-quiet -mr-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-limestone-300 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
