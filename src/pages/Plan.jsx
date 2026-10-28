import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlanner } from '../context/PlannerContext.jsx';
import { useRouter } from '../lib/router.jsx';
import { usePageMeta } from '../lib/seo.js';
import { byId } from '../lib/data.js';
import { read, tripKey, write } from '../lib/store.js';
import ChatPane from '../components/planner/ChatPane.jsx';
import PlanView from '../components/planner/PlanView.jsx';
import TripForm, { TripFormActions } from '../components/planner/TripForm.jsx';
import EnquiryDialog from '../components/planner/EnquiryDialog.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import Notice from '../components/ui/Notice.jsx';

const MIN = 320;
const MAX = 680;

export default function Plan() {
  usePageMeta({
    title: 'Trip planner',
    description: 'Plan a trip to Northern Pakistan with Raahi: chat or fill in the form to get a day-by-day plan with drive times, stays, costs, forecasts and road information.',
    path: '/plan',
  });
  const { query, navigate } = useRouter();
  const { itinerary, loadTrip, prefillDestination } = usePlanner();
  const [view, setView] = useState('chat');
  const [formOpen, setFormOpen] = useState(false);
  const [width, setWidth] = useState(() => Math.min(MAX, Math.max(MIN, read('raahi:chat-width', 430))));
  const [loadError, setLoadError] = useState(null);
  const planRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const tripId = query.get('trip');
    const dest = query.get('d');
    if (tripId) {
      const token = tripKey(tripId);
      navigate('/plan', { replace: true });
      if (!token) {
        setLoadError('This browser doesn’t have the private key for that trip, so it can’t be opened here.');
        return;
      }
      loadTrip(tripId, token).then(() => setView('plan')).catch((e) => setLoadError(e.message));
    } else if (dest && byId[dest]) {
      navigate('/plan', { replace: true });
      prefillDestination(dest);
      setFormOpen(true);
    }
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const resize = useCallback((w) => {
    const next = Math.min(MAX, Math.max(MIN, w));
    setWidth(next);
    write('raahi:chat-width', next);
  }, []);

  const showPlan = () => {
    setView('plan');
    planRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main id="main" className="mt-16 flex h-[calc(100dvh-4rem)] flex-col">
      <h1 className="sr-only">Trip planner</h1>
      <div className="no-print flex border-b border-limestone-300 bg-paper lg:hidden" role="tablist" aria-label="Planner view">
        {[['chat', 'Chat'], ['plan', itinerary ? 'Your plan' : 'Plan']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`flex-1 border-b-2 py-3 text-sm font-semibold ${view === id ? 'border-juniper text-juniper' : 'border-transparent text-ink-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="px-4 pt-3">
          <Notice level="warning" title="Couldn’t open that trip" action={<button type="button" className="btn-quiet" onClick={() => setLoadError(null)}>Dismiss</button>}>
            {loadError}
          </Notice>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className={`no-print min-h-0 w-full lg:block lg:w-[var(--chat-w)] lg:shrink-0 ${view === 'chat' ? 'block' : 'hidden'}`} style={{ '--chat-w': `${width}px` }}>
          <ChatPane onShowPlan={showPlan} onOpenForm={() => setFormOpen(true)} />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the chat panel"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') resize(width - 32);
            if (e.key === 'ArrowRight') resize(width + 32);
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) resize(drag.current.w + e.clientX - drag.current.x);
          }}
          onPointerUp={() => { drag.current = null; }}
          className="no-print hidden w-2 shrink-0 cursor-col-resize border-x border-limestone-300 bg-limestone-200 hover:bg-juniper-100 focus-visible:bg-juniper-100 lg:block"
        />
        <div ref={planRef} className={`print-full min-h-0 flex-1 overflow-y-auto lg:block ${view === 'plan' ? 'block' : 'hidden'}`}>
          <PlanView onOpenForm={() => setFormOpen(true)} />
        </div>
      </div>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Trip details" wide
        footer={<TripFormActions onCancel={() => setFormOpen(false)} />}>
        <TripForm onDone={() => { setFormOpen(false); setView('plan'); }} />
      </Dialog>
      <EnquiryDialog />
    </main>
  );
}
