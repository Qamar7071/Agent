import { useState } from 'react';
import {
  AlertTriangle, BedDouble, Car, Info, MapPinned, MessageSquareText, Printer, RotateCcw, Sparkles,
  Users, Wallet, CalendarRange, Navigation, ExternalLink, Plane, ChevronDown, Hotel, CloudSun,
} from 'lucide-react';
import { destinationById } from '../../data/destinations.js';
import { transports } from '../../data/content.js';
import { coords } from '../../data/logistics.js';
import { sourcesFor } from '../../lib/images.js';
import { fmtDate, pkr } from '../../lib/format.js';
import { useApp } from '../../context/AppContext.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import WeatherCard from '../weather/WeatherCard.jsx';

const card = 'rounded-[24px] border border-line bg-white shadow-card';

function Empty() {
  return (
    <div className={`${card} flex min-h-[520px] flex-col items-center justify-center gap-5 border-dashed p-10 text-center shadow-none`}>
      <svg aria-hidden="true" width="120" height="70" viewBox="0 0 120 70" fill="none">
        <path d="M4 66 L36 18 L54 42 L66 28 L116 66 Z" fill="#EEF5FF" stroke="#1570EF" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M14 60 C 40 50, 70 58, 106 46" stroke="#14B8A6" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
        <circle cx="106" cy="46" r="4.5" fill="#F59E0B" />
      </svg>
      <div>
        <p className="font-display text-[22px] font-semibold text-ink">Your day-by-day plan appears here</p>
        <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-500">Pick destinations and dates, then press Plan My Journey. You’ll get real distances, live weather, stays and an estimated budget.</p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className={`${card} flex flex-col gap-4 p-7`} role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-display text-[19px] font-semibold">
        <Sparkles size={19} className="animate-pulse text-brand" aria-hidden="true" /> Mapping your route, distances and budget…
      </p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 rounded-2xl bg-surface p-4">
          <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-line" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-24 animate-pulse rounded bg-line" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Failure({ message, onRetry }) {
  return (
    <div className="flex min-h-[320px] flex-col items-start justify-center gap-4 rounded-[24px] border border-rose/30 bg-rose-50 p-8" role="alert">
      <AlertTriangle className="text-rose" aria-hidden="true" />
      <div>
        <p className="font-display text-[21px] font-semibold text-ink">We couldn’t build that plan</p>
        <p className="mt-1 text-[15px] text-ink-600">{message}</p>
      </div>
      <button type="button" onClick={onRetry} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white hover:bg-brand"><RotateCcw size={16} aria-hidden="true" /> Try again</button>
    </div>
  );
}

function LegRow({ leg }) {
  if (!leg) return null;
  const Icon = leg.mode === 'flight' ? Plane : leg.mode === 'jeep' ? Navigation : Car;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-[13px]">
      <span className="inline-flex items-center gap-1.5 font-semibold text-brand"><Icon size={14} aria-hidden="true" /> {leg.mode === 'flight' ? 'Flight' : 'Drive'}</span>
      {leg.km != null && <span className="text-ink-700">~{leg.km} km</span>}
      {leg.time && <span className="text-ink-700">{leg.time}</span>}
      {leg.approx && <span className="text-ink-400">(approx)</span>}
      <a href={leg.maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand underline-offset-2 hover:underline">
        <ExternalLink size={12} aria-hidden="true" /> Exact on Google Maps
      </a>
      {leg.note && <span className="w-full text-[12px] text-ink-500">{leg.note}</span>}
    </div>
  );
}

function BudgetPanel({ budget }) {
  const [open, setOpen] = useState(false);
  if (!budget) return null;
  const over = budget.vsBudget.diff > 0;
  return (
    <div className="mx-6 mt-4 rounded-2xl border border-line bg-surface p-5 sm:mx-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-600"><Wallet size={16} className="text-brand" aria-hidden="true" /> Estimated budget</p>
          <p className="mt-1 font-display text-[28px] font-bold leading-none text-ink">{pkr(budget.total)}</p>
          <p className="mt-1 text-[13px] text-ink-500">{pkr(budget.perPerson)} per person · indicative estimate</p>
        </div>
        {budget.vsBudget.budget > 0 && (
          <span className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${over ? 'bg-rose-50 text-rose' : 'bg-leaf-50 text-leaf'}`}>
            {over ? `${pkr(budget.vsBudget.diff)} over budget` : `${pkr(-budget.vsBudget.diff)} under budget`}
          </span>
        )}
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {budget.lines.map((l) => (
          <li key={l.label} className="flex items-center justify-between py-2 text-[14px]">
            <span className="text-ink-600">{l.label}</span>
            <span className="font-semibold text-ink">{pkr(l.amount)}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand">
        How is this calculated? <ChevronDown size={13} className={open ? 'rotate-180' : ''} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] text-ink-500 marker:text-brand">
          {budget.assumptions.map((a) => <li key={a}>{a}</li>)}
          <li className="font-medium text-ink-600">These are indicative figures to help you plan — confirm live prices when you book.</li>
        </ul>
      )}
    </div>
  );
}

function StaysPanel({ recs }) {
  if (!recs?.length) return null;
  return (
    <section className="mx-6 mt-4 flex flex-col gap-3 sm:mx-7" aria-label="Recommended stays">
      <h4 className="flex items-center gap-2 font-display text-[16px] font-semibold text-ink"><Hotel size={17} className="text-brand" aria-hidden="true" /> Where to stay &amp; live weather</h4>
      {recs.map((r) => {
        const d = destinationById[r.destinationId];
        const ll = coords[r.destinationId];
        return (
          <div key={r.destinationId} className="rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink">{d.name} <span className="font-normal text-ink-500">· {r.base}</span></p>
              <a href={r.search} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"><ExternalLink size={12} aria-hidden="true" /> Check live prices</a>
            </div>
            {r.note && <p className="mt-1 text-[12.5px] text-[#B45309]">{r.note}</p>}
            <ul className="mt-2 flex flex-col gap-1.5">
              {r.options.map((o) => (
                <li key={o.name} className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="text-ink-700">{o.name} <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-500">{o.tier}</span></span>
                  <span className="shrink-0 font-semibold text-ink">{o.from === 0 ? 'Operator-arranged' : `${pkr(o.from)}–${pkr(o.to).replace('PKR ', '')}`}<span className="font-normal text-ink-400">/night</span></span>
                </li>
              ))}
            </ul>
            {ll && <div className="mt-3"><WeatherCard lat={ll[0]} lng={ll[1]} name={d.name} altitude={d.altitude} compact /></div>}
            <p className="mt-2 text-[11px] text-ink-400">Prices are indicative ranges, not live quotes — confirm when booking.</p>
          </div>
        );
      })}
    </section>
  );
}

export default function ItineraryView({ status, plan, failure, onRetry, onReset }) {
  const { askAbout } = useApp();
  if (status === 'loading') return <Loading />;
  if (status === 'error') return <Failure message={failure} onRetry={onRetry} />;
  if (status !== 'success' || !plan) return <Empty />;

  const req = plan.request || {};
  const transport = transports.find((t) => t.id === req.transport)?.label;
  const refine = () => askAbout(`Help me refine my ${plan.days.length}-day plan: ${plan.days.map((d) => `Day ${d.day} ${d.title}`).join('; ')}. Budget ${pkr(req.budget) || 'flexible'} for ${req.travelers || 2} people.`);
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-ink-700';

  return (
    <div id="itinerary" className={`${card} flex flex-col overflow-hidden`}>
      <header className="border-b border-line p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${plan.source === 'ai' ? 'bg-brand-50 text-brand' : 'bg-sun-50 text-[#B45309]'}`}>{plan.source === 'ai' ? 'AI plan' : 'Smart draft'}</span>
          <span className="text-[13px] font-medium text-ink-500">{plan.days.length} days</span>
        </div>
        <h3 className="mt-3 font-display text-[clamp(1.5rem,2.6vw,2.1rem)] font-bold leading-tight text-ink">{plan.title}</h3>
        {plan.summary && <p className="mt-1.5 text-[15px] text-ink-600">{plan.summary}</p>}
        <ul className="mt-4 flex flex-wrap gap-2 text-[13px]">
          {req.startDate && <li className={chip}><CalendarRange size={13} aria-hidden="true" /> From {fmtDate(new Date(`${req.startDate}T00:00:00`))}</li>}
          {req.travelers && <li className={chip}><Users size={13} aria-hidden="true" /> {req.travelers} travellers</li>}
          {transport && <li className={chip}><Car size={13} aria-hidden="true" /> {transport}</li>}
        </ul>
        {plan.source === 'offline' && (
          <p className="mt-4 flex gap-2 rounded-xl bg-sun-50 p-3 text-[13px] leading-relaxed text-ink-700">
            <Info size={15} className="mt-0.5 shrink-0 text-sun" aria-hidden="true" />
            Built from Raahi’s curated guide: real distances, live weather and stays. The budget is an indicative estimate — connect your AI backend for live pricing and availability.
          </p>
        )}
      </header>

      <BudgetPanel budget={plan.budget} />

      {plan.warnings?.length > 0 && (
        <ul className="mx-6 mt-4 flex flex-col gap-2 sm:mx-7">
          {plan.warnings.map((w) => <li key={w} className="flex gap-2 rounded-xl bg-rose-50 p-3 text-[13.5px] text-ink-700"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose" aria-hidden="true" /> {w}</li>)}
        </ul>
      )}

      <ol className="relative flex flex-col gap-3 p-6 sm:p-7">
        {plan.days.map((d, i) => {
          const dest = d.destinationId ? destinationById[d.destinationId] : null;
          const date = d.date instanceof Date ? d.date : d.date ? new Date(d.date) : null;
          const last = i === plan.days.length - 1;
          return (
            <li key={d.day} className="relative flex gap-4">
              {!last && <span aria-hidden="true" className="absolute bottom-[-14px] left-[31px] top-[68px] w-[2px] bg-brand-100" />}
              <div className="relative z-10 h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-4 ring-white">
                {dest ? <SmartImage sources={sourcesFor(dest.id, 240)} alt="" tone={dest.tone} className="h-full w-full" /> : <div className="flex h-full w-full items-center justify-center bg-brand-50 text-brand"><MapPinned size={20} aria-hidden="true" /></div>}
              </div>
              <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-white p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold">
                  <span className="rounded-md bg-brand px-2 py-0.5 text-white">Day {d.day}</span>
                  {date && !Number.isNaN(date.getTime()) && <span className="text-ink-500">{fmtDate(date)}</span>}
                  {(dest?.name || d.location) && <span className="text-brand">{dest?.name || d.location}</span>}
                </p>
                <p className="mt-1.5 font-display text-[17px] font-semibold leading-snug text-ink">{d.title}</p>
                {d.leg && <div className="mt-2"><LegRow leg={d.leg} /></div>}
                {d.activities?.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1 text-[14px] text-ink-600">
                    {d.activities.map((a) => <li key={a} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />{a}</li>)}
                  </ul>
                )}
                {(d.transport || d.stay || pkr(d.cost)) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-500">
                    {d.transport && <span className="inline-flex items-center gap-1"><Car size={12} aria-hidden="true" /> {d.transport}</span>}
                    {d.stay && <span className="inline-flex items-center gap-1"><BedDouble size={12} aria-hidden="true" /> {d.stay}</span>}
                    {pkr(d.cost) && <span className="inline-flex items-center gap-1"><Wallet size={12} aria-hidden="true" /> {pkr(d.cost)}</span>}
                  </div>
                )}
                {d.notes?.map((n) => <p key={n} className="mt-1 flex gap-1.5 text-[12.5px] font-medium text-[#B45309]"><Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {n}</p>)}
              </div>
            </li>
          );
        })}
      </ol>

      <StaysPanel recs={plan.stayRecs} />

      <footer className="mt-4 flex flex-wrap gap-2 border-t border-line bg-surface p-5 print:hidden">
        <button type="button" onClick={refine} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-600"><MessageSquareText size={16} aria-hidden="true" /> Refine with Raahi</button>
        <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white px-5 text-[14px] font-semibold text-ink hover:border-ink-400"><Printer size={16} aria-hidden="true" /> Save as PDF</button>
        <button type="button" onClick={onReset} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-ink-500 hover:text-ink"><RotateCcw size={15} aria-hidden="true" /> Start over</button>
      </footer>
    </div>
  );
}
