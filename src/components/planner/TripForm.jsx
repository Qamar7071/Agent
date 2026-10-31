import { useMemo, useState } from 'react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { byId, origins, routeOrder } from '../../lib/data.js';
import { MONTHS, todayIso } from '../../lib/format.js';
import Notice from '../ui/Notice.jsx';

const INTERESTS = [
  ['mountains', 'Mountains'], ['lakes', 'Lakes'], ['culture', 'Forts and culture'], ['food', 'Local food'],
  ['photography', 'Photography'], ['trekking', 'Trekking'], ['relaxation', 'Peace and quiet'], ['family', 'Family-friendly'],
];
const NEEDS = [
  ['limited_mobility', 'Limited walking'], ['wheelchair', 'Wheelchair user'], ['elderly', 'Older travellers'],
  ['altitude_sensitive', 'Sensitive to altitude'], ['infant', 'Travelling with an infant'],
];
const TRANSPORT = [
  ['car', 'Hired car with driver', 'Most flexible on mountain roads'],
  ['flight', 'Fly to Gilgit or Skardu', 'Fastest; flights are often cancelled by weather'],
  ['bus', 'Public coach', 'Cheapest; fixed times, taxis for side trips'],
];
const STAYS = [['budget', 'Budget'], ['mid', 'Mid-range'], ['premium', 'Premium']];
const PACE = [['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['active', 'Packed']];

function initial(state, plan) {
  const src = plan?.request || state || {};
  return {
    origin: src.origin || 'Islamabad',
    destinations: src.destinations || [],
    dateMode: src.start_date ? 'date' : (src.travel_month || src.month) ? 'month' : 'date',
    start_date: src.start_date || '',
    travel_month: src.travel_month || src.month || '',
    days: src.days || 7,
    adults: src.adults || 2,
    children: src.children || 0,
    budget_pkr: src.budget_pkr ?? '',
    budget_basis: src.budget_basis || 'total',
    transport: src.transport || 'car',
    accommodation: src.accommodation || 'mid',
    pace: src.pace || 'balanced',
    interests: src.interests || [],
    accessibility: src.accessibility || [],
    food: src.food || '',
    guide: Boolean(src.guide),
    day_edits: src.day_edits || {},
  };
}

function RadioGroup({ legend, name, options, value, onChange, columns = 3 }) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className={`grid gap-2 ${columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-3'}`}>
        {options.map(([id, label, hint]) => (
          <label key={id} className={`flex cursor-pointer flex-col rounded border px-3 py-2.5 text-sm ${value === id ? 'border-juniper bg-juniper-50' : 'border-limestone-400 bg-paper hover:border-juniper-600'}`}>
            <span className="flex items-center gap-2 font-semibold">
              <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} className="accent-juniper" />
              {label}
            </span>
            {hint && <span className="mt-0.5 pl-5 text-xs text-ink-600">{hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TripFormActions({ onCancel }) {
  const { planBusy } = usePlanner();
  return (
    <>
      <button type="button" onClick={onCancel} className="btn-outline">Cancel</button>
      <button type="submit" form="trip-form" disabled={planBusy} className="btn-primary px-6">{planBusy ? 'Building…' : 'Build my plan'}</button>
    </>
  );
}

export default function TripForm({ onDone }) {
  const { agentState, itinerary, buildPlan, planError } = usePlanner();
  const [v, setV] = useState(() => initial(agentState, itinerary));
  const [errors, setErrors] = useState({});
  const set = (key) => (value) => setV((x) => ({ ...x, [key]: value }));
  const toggle = (key, id) => setV((x) => ({ ...x, [key]: x[key].includes(id) ? x[key].filter((i) => i !== id) : [...x[key], id] }));
  const ordered = useMemo(() => routeOrder.map((id) => byId[id]), []);

  const validate = () => {
    const e = {};
    if (!v.destinations.length) e.destinations = 'Choose at least one place.';
    if (v.dateMode === 'date' && v.start_date && v.start_date < todayIso()) e.start_date = 'This date is in the past.';
    const days = Number(v.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) e.days = 'Enter 1 to 30 days.';
    const adults = Number(v.adults);
    if (!Number.isInteger(adults) || adults < 1 || adults > 20) e.adults = 'Enter 1 to 20 adults.';
    const kids = Number(v.children);
    if (!Number.isInteger(kids) || kids < 0 || kids > 12) e.children = 'Enter 0 to 12 children.';
    if (v.budget_pkr !== '' && (!Number.isFinite(Number(v.budget_pkr)) || Number(v.budget_pkr) < 0)) e.budget_pkr = 'Enter an amount in rupees, or leave it empty.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const request = {
      origin: v.origin,
      destinations: v.destinations,
      start_date: v.dateMode === 'date' && v.start_date ? v.start_date : null,
      travel_month: v.dateMode === 'month' && v.travel_month ? Number(v.travel_month) : null,
      days: Number(v.days),
      adults: Number(v.adults),
      children: Number(v.children),
      budget_pkr: v.budget_pkr === '' ? null : Math.round(Number(v.budget_pkr)),
      budget_basis: v.budget_basis,
      transport: v.transport,
      accommodation: v.accommodation,
      pace: v.pace,
      interests: v.interests,
      accessibility: v.accessibility,
      food: v.food.trim() || null,
      guide: v.guide,
      day_edits: v.day_edits,
    };
    const plan = await buildPlan(request);
    if (plan) onDone?.();
  };

  const err = (k) => errors[k] && <p id={`${k}-err`} className="mt-1 text-sm font-medium text-brick">{errors[k]}</p>;

  return (
    <form id="trip-form" onSubmit={submit} noValidate className="flex flex-col gap-6">
      <fieldset>
        <legend className="field-label">Places</legend>
        <div className="flex flex-wrap gap-2" aria-describedby={errors.destinations ? 'destinations-err' : undefined}>
          {ordered.map((d) => (
            <button key={d.id} type="button" role="checkbox" aria-checked={v.destinations.includes(d.id)} onClick={() => toggle('destinations', d.id)} className="chip">
              {d.name}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-600">Raahi puts them in road order for you.</p>
        {err('destinations')}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tf-origin" className="field-label">Starting from</label>
          <select id="tf-origin" value={v.origin} onChange={(e) => set('origin')(e.target.value)} className="field">
            {origins.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tf-days" className="field-label">Total days, including travel</label>
          <input id="tf-days" type="number" inputMode="numeric" min="1" max="30" value={v.days} onChange={(e) => set('days')(e.target.value)} className="field" aria-invalid={Boolean(errors.days)} aria-describedby={errors.days ? 'days-err' : undefined} />
          {err('days')}
        </div>
      </div>

      <fieldset>
        <legend className="field-label">When</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Date or month">
          {[['date', 'I know my dates'], ['month', 'Only the month']].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={v.dateMode === id} onClick={() => set('dateMode')(id)} className="chip">{label}</button>
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          {v.dateMode === 'date' ? (
            <>
              <label htmlFor="tf-start" className="sr-only">First day of the trip</label>
              <input id="tf-start" type="date" min={todayIso()} value={v.start_date} onChange={(e) => set('start_date')(e.target.value)} className="field" aria-invalid={Boolean(errors.start_date)} aria-describedby={errors.start_date ? 'start_date-err' : undefined} />
              {err('start_date')}
            </>
          ) : (
            <>
              <label htmlFor="tf-month" className="sr-only">Travel month</label>
              <select id="tf-month" value={v.travel_month} onChange={(e) => set('travel_month')(e.target.value)} className="field">
                <option value="">Choose a month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </>
          )}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tf-adults" className="field-label">Adults</label>
          <input id="tf-adults" type="number" inputMode="numeric" min="1" max="20" value={v.adults} onChange={(e) => set('adults')(e.target.value)} className="field" aria-invalid={Boolean(errors.adults)} aria-describedby={errors.adults ? 'adults-err' : undefined} />
          {err('adults')}
        </div>
        <div>
          <label htmlFor="tf-children" className="field-label">Children</label>
          <input id="tf-children" type="number" inputMode="numeric" min="0" max="12" value={v.children} onChange={(e) => set('children')(e.target.value)} className="field" aria-invalid={Boolean(errors.children)} aria-describedby={errors.children ? 'children-err' : undefined} />
          {err('children')}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="tf-budget" className="field-label">Budget in Rs (optional)</label>
          <input id="tf-budget" type="number" inputMode="numeric" min="0" step="1000" placeholder="e.g. 150000" value={v.budget_pkr} onChange={(e) => set('budget_pkr')(e.target.value)} className="field num" aria-invalid={Boolean(errors.budget_pkr)} aria-describedby={errors.budget_pkr ? 'budget_pkr-err' : undefined} />
          {err('budget_pkr')}
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Budget is">
          {[['total', 'In total'], ['per_person', 'Per person']].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={v.budget_basis === id} onClick={() => set('budget_basis')(id)} className="chip">{label}</button>
          ))}
        </div>
      </div>

      <RadioGroup legend="Getting there" name="transport" options={TRANSPORT} value={v.transport} onChange={set('transport')} />
      <div className="grid gap-6 sm:grid-cols-2">
        <RadioGroup legend="Stays" name="accommodation" options={STAYS} value={v.accommodation} onChange={set('accommodation')} columns={2} />
        <RadioGroup legend="Pace" name="pace" options={PACE} value={v.pace} onChange={set('pace')} columns={2} />
      </div>

      <fieldset>
        <legend className="field-label">Interests (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map(([id, label]) => (
            <button key={id} type="button" role="checkbox" aria-checked={v.interests.includes(id)} onClick={() => toggle('interests', id)} className="chip">{label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label">Access needs (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {NEEDS.map(([id, label]) => (
            <button key={id} type="button" role="checkbox" aria-checked={v.accessibility.includes(id)} onClick={() => toggle('accessibility', id)} className="chip">{label}</button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-600">Raahi warns about hikes, stairs and altitude for these.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <div>
          <label htmlFor="tf-food" className="field-label">Food preference (optional)</label>
          <input id="tf-food" value={v.food} maxLength={120} onChange={(e) => set('food')(e.target.value)} placeholder="e.g. vegetarian" className="field" />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={v.guide} onChange={(e) => set('guide')(e.target.checked)} className="h-4 w-4 accent-juniper" />
          Add a local guide on sightseeing days
        </label>
      </div>

      {planError && <Notice level="danger" title="The plan couldn’t be built">{planError.message}</Notice>}
      {Object.keys(errors).length > 0 && <Notice level="warning">Please check the highlighted details above.</Notice>}
    </form>
  );
}
