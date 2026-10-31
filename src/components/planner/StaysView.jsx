import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../../lib/api.js';
import { pkr, pkrRange, plural } from '../../lib/format.js';
import PlaceList, { PLACE_TOWNS } from './PlaceList.jsx';

const PRESETS = [
  ['Budget', { min: null, max: 7000 }],
  ['Mid-range', { min: 7000, max: 18000 }],
  ['Premium', { min: 18000, max: null }],
];

const num = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v))));

function rangeText({ min, max }) {
  if (min && max) return pkrRange(min, max);
  if (max) return `up to ${pkr(max)}`;
  if (min) return `${pkr(min)} or more`;
  return 'any price';
}

const inRange = (o, r) => (!o.to || (r.min == null && r.max == null) ? null : o.from <= (r.max ?? Infinity) && o.to >= (r.min ?? 0));

function TownPlaces({ stay, range }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, data: null, error: null });

  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api.places(stay.hub, 'stay', range, { signal: ctrl.signal })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((e) => { if (e.kind !== 'cancelled') setState({ loading: false, data: null, error: e.message }); });
    return () => ctrl.abort();
  }, [open, stay.hub, range]);

  if (!open) {
    return (
      <button type="button" className="btn-outline mt-3" onClick={() => setOpen(true)}>
        Show more places on the map
      </button>
    );
  }
  return (
    <div className="mt-4 border-t border-limestone-300 pt-3">
      <h4 className="text-sm font-semibold">More places from OpenStreetMap</h4>
      {state.loading && <p className="mt-1 text-sm text-ink-600" role="status">Looking up places…</p>}
      {state.error && (
        <p className="mt-1 text-sm text-brick" role="alert">
          {state.error} <button type="button" className="link" onClick={() => { setOpen(false); setTimeout(() => setOpen(true)); }}>Try again</button>
        </p>
      )}
      {state.data && (
        <>
          <PlaceList live={state.data.live} kind="stay" />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {state.data.check_prices?.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 py-1">
                <ExternalLink size={13} aria-hidden="true" /> {l.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function StaysView({ stays, budget }) {
  const allowance = budget?.stay_allowance;
  const [draft, setDraft] = useState({ min: '', max: '' });
  const [range, setRange] = useState({ min: null, max: null });
  const presets = allowance?.per_room_night
    ? [...PRESETS, ['What my budget allows', { min: null, max: allowance.per_room_night }]]
    : PRESETS;

  const apply = (r) => {
    setRange(r);
    setDraft({ min: r.min ?? '', max: r.max ?? '' });
  };
  const hasRange = range.min != null || range.max != null;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-ink-600">
        Where you sleep each night. Raahi’s guide gives indicative prices per room per night; they are not quotes and say
        nothing about availability, so confirm with the place before you pay.
      </p>

      <form
        className="rounded border border-limestone-300 bg-paper p-4"
        onSubmit={(e) => { e.preventDefault(); apply({ min: num(draft.min), max: num(draft.max) }); }}
        aria-labelledby="range-h"
      >
        <h3 id="range-h" className="font-semibold">Your price range per room per night</h3>
        {allowance && <p className="mt-1 text-sm text-ink-600">{allowance.message}</p>}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="range-min" className="field-label">From (Rs)</label>
            <input id="range-min" className="field num w-32" inputMode="numeric" value={draft.min}
              onChange={(e) => setDraft({ ...draft, min: e.target.value.replace(/[^\d]/g, '') })} placeholder="0" />
          </div>
          <div>
            <label htmlFor="range-max" className="field-label">To (Rs)</label>
            <input id="range-max" className="field num w-32" inputMode="numeric" value={draft.max}
              onChange={(e) => setDraft({ ...draft, max: e.target.value.replace(/[^\d]/g, '') })} placeholder="any" />
          </div>
          <button type="submit" className="btn-primary">Show matches</button>
          {hasRange && <button type="button" className="btn-quiet" onClick={() => apply({ min: null, max: null })}>Clear</button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
          {presets.map(([label, r]) => (
            <button key={label} type="button" className="chip" aria-pressed={range.min === r.min && range.max === r.max}
              onClick={() => apply(r)}>
              {label}: {rangeText(r)}
            </button>
          ))}
        </div>
      </form>

      <ul className="flex flex-col gap-5">
        {stays.map((s) => {
          const options = (s.options || []).map((o) => ({ ...o, fit: inRange(o, range) }));
          if (hasRange) options.sort((a, b) => (a.fit === true ? 0 : 1) - (b.fit === true ? 0 : 1));
          return (
            <li key={s.hub} className="rounded border border-limestone-300 bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="type-semiwide text-lg font-bold">{s.name}</h3>
                <span className="text-sm text-ink-600">{plural(s.nights, 'night')}</span>
              </div>
              {s.note && <p className="mt-1 text-sm text-ink-700">{s.note}</p>}
              <p className="mt-1 text-xs text-ink-500">
                The budget uses <span className="num">{pkr(s.budget_rate.amount)}</span> per room per night ({s.budget_rate.source}).
              </p>
              {options.length > 0 && (
                <ul className="mt-3 divide-y divide-limestone-300 text-sm">
                  {options.map((o) => (
                    <li key={o.name} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 ${o.fit === false ? 'text-ink-500' : ''}`}>
                      <span>
                        <span className="font-medium">{o.name}</span>
                        <span className="ml-2 text-xs text-ink-500">{o.tier}</span>
                        {o.fit === true && <span className="ml-2 rounded border border-juniper-100 bg-juniper-50 px-1.5 py-0.5 text-xs text-juniper-700">Fits your range</span>}
                        {o.fit === false && <span className="ml-2 text-xs">Outside your range</span>}
                      </span>
                      <span className="num text-ink-700">
                        {o.to ? pkrRange(o.from, o.to) : 'Arranged by your operator'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.price_note && <p className="mt-2 text-xs text-ink-500">{s.price_note}</p>}
              {PLACE_TOWNS.includes(s.hub) && <TownPlaces stay={s} range={range} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
