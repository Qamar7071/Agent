import { ExternalLink, Phone } from 'lucide-react';
import { checkedAt } from '../../lib/format.js';

// The honest road answer: what is unknown is said first, then what is known, each labelled.
export default function RoadStatus({ status, compact = false }) {
  if (!status) return null;
  const alerts = status.official_weather_alerts || {};
  const active = (alerts.alerts || []).filter((a) => a.active);
  const reports = status.unverified_closure_reports || [];
  const model = status.model_estimate || {};
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="font-semibold text-ink">{status.headline}</p>
        <p className="mt-1 text-ink-600">{status.explanation}</p>
        {status.routes?.length > 0 && !compact && <p className="mt-1 text-ink-600">Roads on this trip: {status.routes.join('; ')}.</p>}
      </div>

      <div>
        <p className="font-semibold text-ink">Official weather alerts (PMD)</p>
        {!alerts.available && <p className="text-ink-600">Could not check the PMD alert feed: {alerts.reason}</p>}
        {alerts.available && !active.length && (
          <p className="text-ink-600">No active PMD alert mentions Gilgit-Baltistan or the KKH (checked {checkedAt(alerts.retrieved_at)}). That says nothing about whether roads are open.</p>
        )}
        {active.map((a) => (
          <div key={a.link || a.title} className="mt-2 rounded border border-ochre/40 bg-ochre-50 p-3">
            <p className="font-medium text-ink">{a.title}</p>
            <p className="text-xs text-ink-600">
              {a.severity && `${a.severity} severity. `}
              {a.onset && `From ${checkedAt(a.onset)}`}{a.expires && ` until ${checkedAt(a.expires)}`}.
            </p>
            {a.region_excerpt && <p className="mt-1 text-ink-700">{a.region_excerpt}</p>}
          </div>
        ))}
      </div>

      {reports.length > 0 && (
        <div>
          <p className="font-semibold text-ink">News reports mentioning closures <span className="ml-1 rounded-sm bg-ochre-100 px-1.5 py-0.5 text-xs font-semibold text-ochre-700">Unverified</span></p>
          <ul className="mt-1 flex flex-col gap-1">
            {reports.slice(0, 4).map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="link font-medium">{r.title}</a>
                {r.published && <span className="text-xs text-ink-500"> ({r.published})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && status.seasonal_outlook?.length > 0 && (
        <div>
          <p className="font-semibold text-ink">Seasonal pattern (typical, not live)</p>
          <ul className="mt-1 flex flex-col gap-1 text-ink-600">
            {status.seasonal_outlook.map((s) => (
              <li key={s.route}>
                {s.route}: usually open {s.typical_open_text}.
                {s.usually_open_that_month === false && <strong className="text-brick"> Usually closed in your travel month.</strong>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.available && (
        <div>
          <p className="font-semibold text-ink">Model estimate {model.experimental && <span className="ml-1 rounded-sm bg-brick-50 px-1.5 py-0.5 text-xs font-semibold text-brick">Experimental</span>}</p>
          <p className="text-ink-600">{model.caveat}</p>
        </div>
      )}

      <div>
        <p className="font-semibold text-ink">Check before you drive</p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {(status.official_checks || []).map((c) => (
            <li key={c.url} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 py-0.5">
                {c.name} <ExternalLink size={13} aria-hidden="true" />
              </a>
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 py-0.5 font-semibold text-juniper-600 hover:underline">
                  <Phone size={13} aria-hidden="true" /> Call {c.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-500">{status.rule} Checked {checkedAt(status.retrieved_at)}.</p>
    </div>
  );
}
