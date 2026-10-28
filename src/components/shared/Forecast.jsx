import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react';
import { checkedAt, dayLabel } from '../../lib/format.js';

export function WeatherIcon({ code, size = 18, className = '' }) {
  let Icon = Cloud;
  if (code === 0 || code === 1) Icon = Sun;
  else if (code === 2) Icon = CloudSun;
  else if (code === 45 || code === 48) Icon = CloudFog;
  else if (code >= 51 && code <= 57) Icon = CloudDrizzle;
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) Icon = CloudRain;
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) Icon = CloudSnow;
  else if (code >= 95) Icon = CloudLightning;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

// A forecast exactly as the API returned it: source, check time, confidence, risks.
export default function Forecast({ forecast, days = 5, dark = false }) {
  const muted = dark ? 'text-white/75' : 'text-ink-600';
  if (!forecast) return null;
  if (!forecast.available) {
    return (
      <div className={`text-sm ${muted}`}>
        <p>No forecast: {forecast.reason}</p>
        {forecast.seasonal_note && <p className="mt-1">What usually happens then: {forecast.seasonal_note}</p>}
      </div>
    );
  }
  return (
    <div>
      <ul className="flex flex-col">
        {forecast.days.slice(0, days).map((d) => (
          <li key={d.date} className={`grid grid-cols-[6.5rem_1.5rem_1fr_auto] items-start gap-x-3 border-b py-2.5 text-sm last:border-b-0 ${dark ? 'border-white/10' : 'border-limestone-300'}`}>
            <span className="font-medium">{dayLabel(d.date)}</span>
            <WeatherIcon code={d.code} className={dark ? 'text-apricot-300' : 'text-lake'} />
            <span>
              {d.summary}
              {d.rain_mm ? `, ${d.rain_mm} mm rain` : ''}
              {d.snow_cm ? `, ${d.snow_cm} cm snow` : ''}
              {d.confidence !== 'higher' && <span className={`block text-xs ${muted}`}>Lower confidence: more than a week ahead</span>}
              {d.risks?.map((r) => <span key={r} className={`block text-xs font-medium ${dark ? 'text-apricot-300' : 'text-ochre'}`}>{r}</span>)}
            </span>
            <span className="num whitespace-nowrap text-right">
              {d.min_c}° / <strong>{d.max_c}°C</strong>
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-3 text-xs leading-relaxed ${muted}`}>
        {forecast.source}, checked {checkedAt(forecast.retrieved_at)}. {forecast.note}
      </p>
    </div>
  );
}
