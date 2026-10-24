// Live weather via Open-Meteo (https://open-meteo.com) — free, no API key, CORS-enabled.
// Returns real current conditions + a multi-day forecast. If the call fails (offline,
// blocked), callers show a graceful fallback and link to the official forecast instead.
//
// Note: this runs in the visitor's browser, so it needs internet there. It could not be
// live-tested from the build sandbox (which blocks outbound internet), but it follows
// Open-Meteo's documented API.

const cache = new Map(); // key -> { at, data }
const TTL = 15 * 60 * 1000;

// WMO weather codes → label + lucide icon name + day/night-neutral tone.
const WMO = {
  0: ['Clear sky', 'Sun'],
  1: ['Mainly clear', 'Sun'],
  2: ['Partly cloudy', 'CloudSun'],
  3: ['Overcast', 'Cloud'],
  45: ['Fog', 'CloudFog'],
  48: ['Rime fog', 'CloudFog'],
  51: ['Light drizzle', 'CloudDrizzle'],
  53: ['Drizzle', 'CloudDrizzle'],
  55: ['Heavy drizzle', 'CloudDrizzle'],
  61: ['Light rain', 'CloudRain'],
  63: ['Rain', 'CloudRain'],
  65: ['Heavy rain', 'CloudRainWind'],
  66: ['Freezing rain', 'CloudRain'],
  67: ['Freezing rain', 'CloudRainWind'],
  71: ['Light snow', 'CloudSnow'],
  73: ['Snow', 'CloudSnow'],
  75: ['Heavy snow', 'Snowflake'],
  77: ['Snow grains', 'CloudSnow'],
  80: ['Rain showers', 'CloudRain'],
  81: ['Rain showers', 'CloudRain'],
  82: ['Violent showers', 'CloudRainWind'],
  85: ['Snow showers', 'CloudSnow'],
  86: ['Heavy snow showers', 'Snowflake'],
  95: ['Thunderstorm', 'CloudLightning'],
  96: ['Storm w/ hail', 'CloudLightning'],
  99: ['Storm w/ hail', 'CloudLightning'],
};

export const describeCode = (code) => {
  const [label, icon] = WMO[code] || ['—', 'Cloud'];
  return { label, icon };
};

export async function fetchWeather(lat, lng, { days = 7, signal } = {}) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FKarachi&forecast_days=${days}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('weather-unavailable');
  const json = await res.json();
  if (!json.current || !json.daily) throw new Error('weather-malformed');

  const data = {
    current: {
      temp: Math.round(json.current.temperature_2m),
      feels: Math.round(json.current.apparent_temperature),
      wind: Math.round(json.current.wind_speed_10m),
      humidity: Math.round(json.current.relative_humidity_2m),
      ...describeCode(json.current.weather_code),
    },
    daily: json.daily.time.map((date, i) => ({
      date,
      max: Math.round(json.daily.temperature_2m_max[i]),
      min: Math.round(json.daily.temperature_2m_min[i]),
      rain: json.daily.precipitation_probability_max?.[i] ?? null,
      ...describeCode(json.daily.weather_code[i]),
    })),
    fetchedAt: Date.now(),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

// Simple, honest advice derived only from the forecast numbers (no fabrication).
export function weatherAdvice(day, altitude) {
  if (!day) return null;
  if (/snow|storm|hail/i.test(day.label)) return 'Snow or storms expected — high passes and treks may be risky. Check road status before you go.';
  if (day.rain != null && day.rain >= 60) return 'High chance of rain — carry a shell and keep flights/roads flexible.';
  if (altitude >= 4000 && day.min <= 0) return 'Below-freezing at this altitude — pack serious warm layers even in summer.';
  if (/clear|sunny|mainly clear/i.test(day.label)) return 'Clear skies — great for views and photography.';
  return null;
}
