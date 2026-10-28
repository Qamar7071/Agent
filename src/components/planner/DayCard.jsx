import { useState } from 'react';
import { ExternalLink, Moon, Pencil, RefreshCw, Undo2 } from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { dayLabel, km, pkr } from '../../lib/format.js';
import { WeatherIcon } from '../shared/Forecast.jsx';

const TYPE = {
  travel: 'Travel day',
  stay: 'Exploring',
  daytrip: 'Day trip',
  buffer: 'Spare day',
  free: 'Free day',
  trek: 'Trek day',
};

function Move({ m }) {
  const t = m.timing || {};
  if (m.mode === 'flight') {
    return (
      <p className="text-sm text-ink-700">
        <strong>Flight {m.from_name} to {m.to_name}</strong>, about 1–2 hours. {m.notes?.[0]}
      </p>
    );
  }
  const how = m.mode === 'jeep' ? 'by road and jeep track' : 'by road';
  return (
    <div className="text-sm text-ink-700">
      <p>
        {m.round_trip ? (
          <><strong>Day trip from {m.from_name}</strong>: {m.time_label} each way {how}, about {m.site_hours} h there.</>
        ) : (
          <><strong>{m.from_name} to {m.to_name}</strong>, {m.time_label} {how}{m.km ? ` (${km(m.km)})` : ''}{m.via?.length ? ` via ${m.via.join(', ')}` : ''}.</>
        )}
      </p>
      <p className="text-ink-600">
        {t.depart && <>Leave {t.depart.startsWith('by') ? t.depart : `around ${t.depart}`}. </>}
        {t.arrive_around && !m.round_trip && <>Arrive around {t.arrive_around}. </>}
        {t.back_around && <>Back around {t.back_around}. </>}
        {t.sunset && <>Sunset {t.sunset}. </>}
        <span className="text-xs">{t.basis}</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-500">
        Drive times are {m.status}.{' '}
        {m.maps_url && <a href={m.maps_url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">Open in Google Maps <ExternalLink size={12} aria-hidden="true" /></a>}
      </p>
    </div>
  );
}

function Editor({ day, onClose }) {
  const { applyChanges, planBusy } = usePlanner();
  const [title, setTitle] = useState(day.title);
  const [acts, setActs] = useState(day.activities.join('\n'));
  const [note, setNote] = useState(day.user_note || '');
  const save = async (e) => {
    e.preventDefault();
    const activities = acts.split('\n').map((a) => a.trim()).filter(Boolean).slice(0, 8);
    const ok = await applyChanges([{ op: 'edit_day', key: day.key, title: title.trim().slice(0, 120), activities, note: note.trim().slice(0, 300) || null }],
      `Day ${day.day} edited by you.`);
    if (ok) onClose();
  };
  return (
    <form onSubmit={save} className="mt-3 flex flex-col gap-3 rounded border border-limestone-300 bg-limestone p-3">
      <div>
        <label htmlFor={`t-${day.key}`} className="field-label">Day title</label>
        <input id={`t-${day.key}`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="field" />
      </div>
      <div>
        <label htmlFor={`a-${day.key}`} className="field-label">Plans, one per line</label>
        <textarea id={`a-${day.key}`} value={acts} rows={4} onChange={(e) => setActs(e.target.value)} className="field py-2" />
      </div>
      <div>
        <label htmlFor={`n-${day.key}`} className="field-label">Your note (optional)</label>
        <input id={`n-${day.key}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="field" />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
        <button type="submit" disabled={planBusy} className="btn-primary">Save day</button>
      </div>
    </form>
  );
}

export default function DayCard({ day, weather }) {
  const { applyChanges, planBusy } = usePlanner();
  const [editing, setEditing] = useState(false);
  const risks = [...new Set([...(weather?.risks || []), ...(day.risks || [])])];
  const editable = !day.key.startsWith('travel:') && !day.key.startsWith('flight:') && !day.key.startsWith('buffer:') && !day.key.startsWith('k2:');

  return (
    <li className="grid grid-cols-[4.25rem_1fr] gap-4 border-b border-limestone-300 py-6 last:border-b-0 sm:grid-cols-[5.5rem_1fr]">
      <div className="text-right">
        <p className="type-wide num text-3xl font-extrabold leading-none text-juniper">{day.day}</p>
        {day.date && <p className="mt-1 text-xs font-medium text-ink-600">{dayLabel(day.date)}</p>}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-500">
          {TYPE[day.type] || 'Day'}
          {day.edited && <span className="ml-2 rounded-sm bg-apricot-100 px-1.5 py-0.5 text-ochre-700">Edited by you</span>}
        </p>
        <h3 className="type-semiwide mt-0.5 text-lg font-bold leading-snug">{day.title}</h3>

        {day.moves?.length > 0 && <div className="mt-2 flex flex-col gap-2">{day.moves.map((m, i) => <Move key={i} m={m} />)}</div>}

        {day.activities?.length > 0 && !day.activities_auto && (
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-[15px] marker:text-juniper-500">
            {day.activities.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
        {day.user_note && <p className="mt-2 rounded-sm bg-apricot-100 px-2 py-1 text-sm text-ink-700">Your note: {day.user_note}</p>}

        {weather && (
          <div className="mt-3 flex gap-2 text-sm text-ink-700">
            <WeatherIcon code={weather.code} className="mt-0.5 shrink-0 text-lake" />
            <p>
              Forecast for {weather.destination_name || 'here'}: {weather.summary}, {weather.min_c}° to {weather.max_c}°C
              {weather.rain_mm ? `, ${weather.rain_mm} mm rain` : ''}{weather.snow_cm ? `, ${weather.snow_cm} cm snow` : ''}
              {weather.confidence !== 'higher' ? ' (lower confidence)' : ''}.
            </p>
          </div>
        )}

        {risks.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ochre-700" aria-label="Risks">
            {risks.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="font-bold">!</span><span>{r}</span></li>)}
          </ul>
        )}
        {day.weather_alternative && (
          <p className="mt-2 text-sm text-ink-600"><span className="font-semibold text-ink-700">If the weather turns: </span>{day.weather_alternative}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {day.overnight && <span className="inline-flex items-center gap-1.5 text-ink-700"><Moon size={14} aria-hidden="true" /> Night in {day.overnight.name}</span>}
          <span className="num text-ink-600">About {pkr(day.cost?.total)} for the day</span>
          <details className="text-xs text-ink-500">
            <summary className="cursor-pointer py-1 hover:text-ink">Sources</summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {day.sources?.map((s) => (
                <li key={s.label}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="link font-normal">{s.label}</a> : s.label}</li>
              ))}
            </ul>
          </details>
        </div>

        {editable && !editing && (
          <div className="no-print mt-2 flex flex-wrap gap-1">
            <button type="button" onClick={() => setEditing(true)} className="btn-quiet text-sm"><Pencil size={14} aria-hidden="true" /> Edit day</button>
            <button type="button" disabled={planBusy} onClick={() => applyChanges([{ op: 'regenerate_day', key: day.key }], `Day ${day.day}: suggested a different plan.`)} className="btn-quiet text-sm">
              <RefreshCw size={14} aria-hidden="true" /> Suggest something else
            </button>
            {day.edited && (
              <button type="button" disabled={planBusy} onClick={() => applyChanges([{ op: 'reset_day', key: day.key }], `Day ${day.day} reset to Raahi’s plan.`)} className="btn-quiet text-sm">
                <Undo2 size={14} aria-hidden="true" /> Undo my changes
              </button>
            )}
          </div>
        )}
        {editing && <Editor day={day} onClose={() => setEditing(false)} />}
      </div>
    </li>
  );
}
