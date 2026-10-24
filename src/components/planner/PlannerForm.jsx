import { Check, Minus, Plus, Sparkles } from 'lucide-react';
import { destinations } from '../../data/destinations.js';
import { budgetPresets, interests, origins, transports } from '../../data/content.js';
import { todayIso } from '../../lib/format.js';

const label = 'text-[13px] font-semibold text-ink-700';
const err = 'mt-1.5 text-[13px] font-medium text-rose';
const box = 'h-12 w-full rounded-xl border bg-white px-4 text-[15px] font-medium text-ink transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition ${active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-600 hover:border-brand-300 hover:text-ink'}`}
    >
      {active && <Check size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

export default function PlannerForm({ form, setForm, errors, onSubmit, loading }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, id) => setForm((f) => ({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] }));
  const invalid = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err`, 'data-invalid': true } : {});
  const border = (k) => (errors[k] ? 'border-rose' : 'border-line');

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      aria-label="Trip planner"
      className="flex flex-col gap-6 rounded-[24px] border border-line bg-white p-6 shadow-card sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pl-from" className={label}>Starting from</label>
          <select id="pl-from" value={form.from} onChange={(e) => set('from', e.target.value)} className={`${box} mt-2 cursor-pointer ${border('from')}`} {...invalid('from')}>
            {origins.map((o) => <option key={o}>{o}</option>)}
          </select>
          {errors.from && <p id="from-err" className={err}>{errors.from}</p>}
        </div>
        <div>
          <label htmlFor="pl-date" className={label}>Start date</label>
          <input id="pl-date" type="date" min={todayIso()} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={`${box} mt-2 ${border('startDate')}`} {...invalid('startDate')} />
          {errors.startDate && <p id="startDate-err" className={err}>{errors.startDate}</p>}
        </div>
      </div>

      <fieldset>
        <legend className={label}>Destinations or region</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {destinations.map((d) => (
            <Chip key={d.id} active={form.destinations.includes(d.id)} onClick={() => toggle('destinations', d.id)}>{d.name}</Chip>
          ))}
        </div>
        {errors.destinations && <p id="destinations-err" className={err} role="alert">{errors.destinations}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="pl-days" className={label}>Trip duration</label>
            <span className="font-display text-[19px] font-semibold text-brand">{form.days} days</span>
          </div>
          <input id="pl-days" type="range" min={2} max={21} value={form.days} onChange={(e) => set('days', Number(e.target.value))} className="mt-4 w-full accent-brand" {...invalid('days')} />
          <div className="mt-1 flex justify-between text-[11.5px] text-ink-400"><span>2 days</span><span>21 days</span></div>
          {errors.days && <p id="days-err" className={err}>{errors.days}</p>}
        </div>
        <div>
          <span id="pl-trav-label" className={label}>Travellers</span>
          <div className="mt-2 flex h-12 items-center justify-between rounded-xl border border-line bg-white px-1.5" role="group" aria-labelledby="pl-trav-label">
            <button type="button" onClick={() => set('travelers', Math.max(1, form.travelers - 1))} aria-label="Fewer travellers" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface"><Minus size={16} /></button>
            <output aria-live="polite" className="text-[15.5px] font-semibold">{form.travelers} {form.travelers === 1 ? 'person' : 'people'}</output>
            <button type="button" onClick={() => set('travelers', Math.min(30, form.travelers + 1))} aria-label="More travellers" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface"><Plus size={16} /></button>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="pl-budget" className={label}>Total budget (PKR)</label>
        <div className={`mt-2 flex h-12 items-center rounded-xl border bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 ${border('budget')}`}>
          <span className="pl-4 pr-2 text-[14px] font-semibold text-ink-500">PKR</span>
          <input
            id="pl-budget"
            inputMode="numeric"
            value={Number.isFinite(form.budget) ? form.budget.toLocaleString('en-PK') : ''}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ''));
              set('budget', e.target.value.trim() === '' ? NaN : n);
            }}
            className="h-full flex-1 rounded-xl bg-transparent pr-4 text-[15px] font-semibold focus:outline-none"
            {...invalid('budget')}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {budgetPresets.map((b) => (
            <button key={b} type="button" onClick={() => set('budget', b)} aria-pressed={form.budget === b} className={`h-9 rounded-full px-3.5 text-[13px] font-semibold transition ${form.budget === b ? 'bg-ink text-white' : 'bg-surface text-ink-600 hover:bg-line'}`}>
              PKR {b / 1000}k
            </button>
          ))}
        </div>
        {errors.budget && <p id="budget-err" className={err}>{errors.budget}</p>}
      </div>

      <fieldset>
        <legend className={label}>Travel interests</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {interests.map((i) => (
            <Chip key={i.id} active={form.interests.includes(i.id)} onClick={() => toggle('interests', i.id)}>{i.label}</Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={label}>Preferred transport</legend>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {transports.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/25 ${form.transport === t.id ? 'border-brand bg-brand-50' : 'border-line bg-white hover:border-brand-300'}`}>
              <input type="radio" name="transport" value={t.id} checked={form.transport === t.id} onChange={() => set('transport', t.id)} className="mt-1 accent-brand" />
              <span className="flex flex-col">
                <span className="text-[14.5px] font-semibold text-ink">{t.label}</span>
                <span className="text-[13px] text-ink-500">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" disabled={loading} className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-brand text-[16px] font-semibold text-white shadow-brand transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-80">
        <Sparkles size={18} aria-hidden="true" />
        {loading ? 'Planning your route…' : 'Plan My Journey'}
      </button>
    </form>
  );
}
