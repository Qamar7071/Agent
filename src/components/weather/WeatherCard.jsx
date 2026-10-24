import { useEffect, useRef, useState } from 'react';
import {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, Snowflake, CloudLightning,
  Wind, Droplets, ExternalLink, RotateCcw, AlertTriangle,
} from 'lucide-react';
import { fetchWeather, weatherAdvice } from '../../lib/weather.js';

const iconMap = { Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, Snowflake, CloudLightning };
const WIcon = ({ name, ...p }) => {
  const C = iconMap[name] || Cloud;
  return <C {...p} />;
};

const dow = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });

export default function WeatherCard({ lat, lng, name, altitude, dark = false, compact = false }) {
  const [state, setState] = useState({ status: 'loading' });
  const ref = useRef(0);

  const load = () => {
    const id = ++ref.current;
    setState({ status: 'loading' });
    const ctrl = new AbortController();
    fetchWeather(lat, lng, { days: compact ? 5 : 7, signal: ctrl.signal })
      .then((data) => id === ref.current && setState({ status: 'ok', data }))
      .catch(() => id === ref.current && setState({ status: 'error' }));
    return () => ctrl.abort();
  };

  useEffect(() => {
    const cancel = load();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const panel = dark ? 'bg-white/10 text-white' : 'bg-surface text-ink';
  const sub = dark ? 'text-white/70' : 'text-ink-500';
  const chip = dark ? 'bg-white/10' : 'bg-white';

  if (state.status === 'loading') {
    return (
      <div className={`rounded-2xl p-4 ${panel}`} role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 animate-pulse rounded-full ${chip}`} />
          <div className="flex flex-col gap-2">
            <div className={`h-3 w-28 animate-pulse rounded ${chip}`} />
            <div className={`h-3 w-20 animate-pulse rounded ${chip}`} />
          </div>
        </div>
        <span className="sr-only">Loading live weather…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={`flex flex-col gap-2 rounded-2xl p-4 text-[13.5px] ${panel}`} role="alert">
        <span className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} className="text-sun" aria-hidden="true" /> Live weather unavailable right now</span>
        <span className={sub}>Couldn’t reach the weather service. Check the official forecast instead.</span>
        <div className="flex gap-3">
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 font-semibold text-brand"><RotateCcw size={13} aria-hidden="true" /> Retry</button>
          <a href="https://www.pmd.gov.pk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand"><ExternalLink size={13} aria-hidden="true" /> PMD forecast</a>
        </div>
      </div>
    );
  }

  const { current, daily } = state.data;
  const advice = weatherAdvice(daily[0], altitude);

  return (
    <div className={`rounded-2xl p-4 ${panel}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <WIcon name={current.icon} size={34} className={dark ? 'text-glacier-300' : 'text-brand'} aria-hidden="true" />
          <div>
            <p className="font-display text-[26px] font-bold leading-none">{current.temp}°<span className="align-top text-[15px]">C</span></p>
            <p className={`text-[13px] ${sub}`}>{current.label}{name ? ` · ${name}` : ''}</p>
          </div>
        </div>
        <div className={`flex flex-col gap-1 text-[12px] ${sub}`}>
          <span className="inline-flex items-center gap-1.5"><Wind size={13} aria-hidden="true" /> {current.wind} km/h</span>
          <span className="inline-flex items-center gap-1.5"><Droplets size={13} aria-hidden="true" /> {current.humidity}%</span>
        </div>
      </div>

      {advice && <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${dark ? 'bg-white/10' : 'bg-white'}`}>{advice}</p>}

      <ul className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {daily.map((d, i) => (
          <li key={d.date} className={`flex min-w-[58px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2.5 ${chip}`}>
            <span className={`text-[11.5px] font-semibold ${sub}`}>{i === 0 ? 'Today' : dow(d.date)}</span>
            <WIcon name={d.icon} size={20} className={dark ? 'text-glacier-300' : 'text-brand'} aria-hidden="true" />
            <span className="text-[12.5px] font-semibold">{d.max}°</span>
            <span className={`text-[11.5px] ${sub}`}>{d.min}°</span>
            {d.rain != null && d.rain >= 20 && <span className="text-[10.5px] text-brand">{d.rain}%</span>}
          </li>
        ))}
      </ul>

      <p className={`mt-2.5 text-[11px] ${sub}`}>Live forecast · Open-Meteo. Confirm road/flight status with PMD & NDMA before travelling.</p>
    </div>
  );
}
