import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import AssistantPanel from './AssistantPanel.jsx';

// Full-height assistant drawer + a floating launcher once the hero panel is off-screen.
export default function AssistantSheet() {
  const { assistantOpen, openAssistant, closeAssistant } = useApp();
  const [showLauncher, setShowLauncher] = useState(false);
  const lastFocus = useRef(null);
  const sheetRef = useRef(null);

  // Launcher appears once the visitor has scrolled past the hero and the hero panel is out of view.
  useEffect(() => {
    const target = document.getElementById('hero-assistant');
    let panelVisible = true;
    const update = () => setShowLauncher(!panelVisible && window.scrollY > window.innerHeight * 0.6);
    const io = new IntersectionObserver(([e]) => {
      panelVisible = e.isIntersecting;
      update();
    }, { threshold: 0.1 });
    if (target) io.observe(target);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!assistantOpen) return;
    lastFocus.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') closeAssistant();
      if (e.key === 'Tab' && sheetRef.current) {
        const f = sheetRef.current.querySelectorAll('button:not([disabled]), a[href], textarea, input, select');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
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
      lastFocus.current?.focus?.();
    };
  }, [assistantOpen, closeAssistant]);

  return (
    <>
      {showLauncher && !assistantOpen && (
        <button
          type="button"
          onClick={openAssistant}
          className="fixed bottom-5 right-5 z-40 inline-flex h-14 items-center gap-2.5 rounded-full bg-brand pl-4 pr-5 font-semibold text-white shadow-brand transition hover:bg-brand-600 animate-rise"
        >
          <Sparkles size={19} aria-hidden="true" />
          Ask Raahi
        </button>
      )}

      {assistantOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Close assistant" tabIndex={-1} onClick={closeAssistant} className="absolute inset-0 bg-night/50 backdrop-blur-sm" />
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Raahi assistant" className="relative h-full w-full max-w-[520px] shadow-panel animate-rise">
            <AssistantPanel variant="sheet" onClose={closeAssistant} autoFocus />
          </div>
        </div>
      )}
    </>
  );
}
