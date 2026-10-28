import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { checkedAt } from '../../lib/format.js';

// Towns where the API can list places (see backend/services/places.py).
export const PLACE_TOWNS = ['hunza', 'attabad', 'passu', 'sost', 'skardu', 'fairy-meadows', 'deosai', 'gilgit', 'chilas'];

const FIT = {
  usually: { text: 'Type usually fits your range', cls: 'bg-juniper-50 text-juniper-700 border-juniper-100' },
  unknown: { text: 'Price level unknown', cls: 'bg-limestone-200 text-ink-700 border-limestone-300' },
  unlikely: { text: 'Usually above or below your range', cls: 'bg-paper text-ink-600 border-limestone-300' },
};

// Real places from OpenStreetMap. They come without prices, and the list says so.
export default function PlaceList({ live, kind }) {
  if (!live) return null;
  if (!live.available) return <p className="text-sm text-ink-600">{live.reason}</p>;
  if (!live.places.length) {
    return <p className="text-sm text-ink-600">OpenStreetMap has no {kind === 'stay' ? 'places to stay' : 'restaurants or cafés'} recorded here yet.</p>;
  }
  return (
    <div>
      <ul className="divide-y divide-limestone-300 text-sm">
        {live.places.map((p) => (
          <li key={p.osm_url} className="flex flex-col gap-1 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span>
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-ink-500">
                  {p.type}{p.stars ? `, ${p.stars}★` : ''}{p.cuisine?.length ? `, ${p.cuisine.join(', ')}` : ''}
                  {p.distance_km != null ? `, ${p.distance_km} km from the centre` : ''}
                </span>
              </span>
              {p.fit && <span className={`rounded border px-2 py-0.5 text-xs ${FIT[p.fit].cls}`}>{FIT[p.fit].text}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <a href={p.maps_url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 py-1">
                <MapPin size={13} aria-hidden="true" /> Map and reviews
              </a>
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="link inline-flex items-center gap-1 py-1">
                  <ExternalLink size={13} aria-hidden="true" /> Website
                </a>
              )}
              {p.phone && (
                <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="link inline-flex items-center gap-1 py-1">
                  <Phone size={13} aria-hidden="true" /> {p.phone}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-500">
        From <a href={live.source_url} target="_blank" rel="noopener noreferrer" className="link font-normal">OpenStreetMap contributors</a>,
        within {live.radius_km} km, checked {checkedAt(live.retrieved_at)}. No prices, and no way to know if a place is open this season.
      </p>
    </div>
  );
}
