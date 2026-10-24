import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { requestPlan, ApiError } from '../../lib/api.js';
import { buildOfflinePlan } from '../../lib/offlinePlanner.js';
import { todayIso } from '../../lib/format.js';
import SectionHeading from '../ui/SectionHeading.jsx';
import Contours from '../ui/Contours.jsx';
import PlannerForm from './PlannerForm.jsx';
import ItineraryView from './ItineraryView.jsx';

export const defaultForm = () => ({
  from: 'Islamabad',
  destinations: ['hunza', 'attabad'],
  startDate: todayIso(14),
  days: 7,
  travelers: 2,
  budget: 150000,
  interests: ['lakes', 'photography'],
  transport: 'car',
});

export function validate(f) {
  const e = {};
  if (!f.from) e.from = 'Choose where you are starting from.';
  if (!f.destinations.length) e.destinations = 'Pick at least one destination.';
  if (!f.startDate) e.startDate = 'Choose a start date.';
  else if (f.startDate < todayIso()) e.startDate = 'The start date is in the past.';
  if (!Number.isFinite(f.days) || f.days < 2 || f.days > 30) e.days = 'Trips can be 2 to 30 days.';
  if (!Number.isFinite(f.travelers) || f.travelers < 1 || f.travelers > 30) e.travelers = 'Between 1 and 30 travellers.';
  if (!Number.isFinite(f.budget) || f.budget < 5000) e.budget = 'Enter a budget of at least PKR 5,000.';
  return e;
}

export default function TripPlanner() {
  const { plannerRequest } = useApp();
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [plan, setPlan] = useState(null);
  const [failure, setFailure] = useState('');
  const resultRef = useRef(null);
  const ctrlRef = useRef(null);

  const generate = useCallback(async (values) => {
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector('[data-invalid="true"]')?.focus());
      return;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setStatus('loading');
    setFailure('');
    if (window.innerWidth < 1024) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    try {
      let result;
      try {
        result = await requestPlan(values, { signal: ctrl.signal });
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'unreachable') {
          await new Promise((r) => setTimeout(r, 700));
          result = buildOfflinePlan(values);
        } else throw e;
      }
      if (ctrl.signal.aborted) return;
      setPlan({ ...result, request: values });
      setStatus('success');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setFailure(e?.message || 'Something went wrong while planning.');
      setStatus('error');
    }
  }, []);

  // React to requests from the hero search, assistant and destination dialog.
  useEffect(() => {
    if (!plannerRequest) return;
    const { values, autoSubmit } = plannerRequest;
    if (values.externalPlan) {
      setPlan({ ...values.externalPlan, source: 'ai', request: form });
      setStatus('success');
      return;
    }
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    const next = { ...form, ...clean };
    setForm(next);
    setErrors({});
    if (autoSubmit) generate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerRequest]);

  return (
    <section id="plan" aria-labelledby="plan-title" className="relative overflow-hidden bg-white py-16 text-ink sm:py-24">
      <Contours className="inset-0 h-full w-full text-brand" opacity={0.07} />
      <div className="relative mx-auto flex max-w-[1400px] flex-col gap-10 px-5 sm:px-8">
        <div id="plan-heading">
          <SectionHeading id="plan-title" eyebrow="AI Trip Planner" title="Tell us your trip," accent="get your route">
            Starting point, dates, budget and what you love — Raahi sequences your stops along the real roads, with buffer days where the mountains demand them.
          </SectionHeading>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <PlannerForm form={form} setForm={setForm} errors={errors} onSubmit={() => generate(form)} loading={status === 'loading'} />
          <div ref={resultRef} className="scroll-mt-24 lg:sticky lg:top-24">
            <ItineraryView status={status} plan={plan} failure={failure} onRetry={() => generate(form)} onReset={() => { setStatus('idle'); setPlan(null); }} />
          </div>
        </div>
      </div>
    </section>
  );
}
