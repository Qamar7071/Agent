// The plan on a map: one colour per day, numbered overnight stops, and a day list that zooms
// to each day and links to Google Maps for the actual road. Leaflet and its styles load only
// when the map is opened. Lines are straight between approximate points, and say so.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { placeName, placePoint } from '../../lib/data.js';
import { directionsUrl, mapModel, nightsLabel } from '../../lib/tripMap.js';
import { plural } from '../../lib/format.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function pin(L, label, color, start) {
  const html = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 7px;`
    + `border-radius:999px;background:${start ? '#ffffff' : color};color:${start ? '#123026' : '#ffffff'};border:2px solid ${start ? '#123026' : '#ffffff'};`
    + `font:700 12px/1 Archivo,system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.35);white-space:nowrap">${label}</span>`;
  return L.divIcon({ className: '', html, iconSize: null, iconAnchor: [14, 14] });
}

export default function TripMap({ itinerary }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [L, setL] = useState(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(null);
  const model = useMemo(() => mapModel(itinerary.days, placePoint, placeName), [itinerary]);

  useEffect(() => {
    let off = false;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([m]) => !off && setL(m.default || m))
      .catch(() => !off && setFailed(true));
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!L || !box.current || map.current) return undefined;
    const m = L.map(box.current, { scrollWheelZoom: false, zoomSnap: 0.5, attributionControl: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 15, minZoom: 5 }).addTo(m);
    m.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [L]);

  // Draw the days; the chosen day stands out and the map moves to it.
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    layer.current.clearLayers();
    for (const s of model.segments) {
      const on = active === null || active === s.day;
      L.polyline([[s.a.lat, s.a.lng], [s.b.lat, s.b.lng]], {
        color: model.days.find((d) => d.day === s.day)?.color, weight: active === s.day ? 6 : 4,
        opacity: on ? 0.95 : 0.25, dashArray: s.mode === 'flight' ? '2 9' : '10 7', lineCap: 'round',
      }).bindTooltip(`Day ${s.day}: ${placeName(s.from)} to ${placeName(s.to)}${s.mode === 'flight' ? ' (flight)' : ''}`, { sticky: true })
        .addTo(layer.current);
    }
    for (const st of model.stops) {
      const label = st.start ? 'Start' : st.nights.length ? nightsLabel(st.nights) : '•';
      const firstDay = st.nights[0] || st.visits[0] || 1;
      const color = model.days.find((d) => d.day === firstDay)?.color || '#1F6F50';
      const title = `${st.name}${st.nights.length ? `: ${plural(st.nights.length, 'night')} (day ${nightsLabel(st.nights)})` : st.start ? ': start' : ''}`;
      L.marker([st.point.lat, st.point.lng], { icon: pin(L, label, color, st.start), title, alt: title, keyboard: true })
        .bindTooltip(title).addTo(layer.current);
    }
    const day = active !== null && model.days.find((d) => d.day === active);
    const pts = day?.points?.length ? day.points : null;
    if (pts && pts.length > 1) m.fitBounds(pts.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 11 });
    else if (pts) m.setView([pts[0].lat, pts[0].lng], 10);
    else if (model.bounds) m.fitBounds(model.bounds, { padding: [30, 30] });
  }, [L, model, active]);

  if (!model.stops.length) return <p className="text-sm text-ink-600">This plan has no places to show on a map.</p>;
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative isolate">
          <div ref={box} className="h-[360px] overflow-hidden rounded-lg border border-limestone-300 bg-limestone-300/50 sm:h-[460px]"
            role="region" aria-label="Map of the trip. The day list has the same information." />
          {!L && !failed && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-600" role="status">Loading the map…</p>}
          {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-ink-700">The map couldn’t load. The day list and directions links still work.</p>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Day by day</h3>
            {active !== null && <button type="button" className="btn-quiet min-h-[36px] text-sm" onClick={() => setActive(null)}>Show all days</button>}
          </div>
          <ol className="mt-2 flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
            {model.days.map((d) => {
              const url = directionsUrl(d.points);
              return (
                <li key={d.day} className={`rounded-md border p-2 ${active === d.day ? 'border-juniper-500 bg-juniper-50' : 'border-transparent'}`}>
                  <button type="button" className="flex w-full items-start gap-2 text-left" aria-pressed={active === d.day}
                    onClick={() => setActive(active === d.day ? null : d.day)}>
                    <span className="num mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white" style={{ background: d.color }}>{d.day}</span>
                    <span className="min-w-0 text-sm font-medium">{d.title}</span>
                  </button>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="link ml-8 inline-flex min-h-[32px] items-center gap-1 text-xs">
                      Directions in Google Maps <ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="mt-3 flex gap-2 text-xs text-ink-600">
        <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Numbers on the pins are the nights you sleep there. Lines are straight between approximate points, not the road:
        use the directions links for the road. Check road status before you drive.
      </p>
    </div>
  );
}
