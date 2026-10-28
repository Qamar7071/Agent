// The destination guide, read from shared/destinations.json: the same file the API and the
// planner use, so the website and the agent can never disagree about a place.
import dataset from '../../shared/destinations.json';

export const meta = dataset.meta;
export const destinations = dataset.destinations;
export const byId = Object.fromEntries(destinations.map((d) => [d.id, d]));
export const routeOrder = dataset.route_order;
export const seasonNotes = dataset.season_notes;
export const seasonalRoutes = dataset.seasonal_routes;
export const generalSources = dataset.general_sources;
export const costModel = dataset.cost_model;
export const origins = Object.keys(dataset.origins);
export const stays = dataset.stays;

export function seasonOf(month) {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

const SEASONAL_ROUTE_FOR = { khunjerab: 'khunjerab-pass', deosai: 'deosai-road', 'fairy-meadows': 'fairy-meadows-track' };
export const seasonalRouteFor = (id) => seasonalRoutes.find((r) => r.id === SEASONAL_ROUTE_FOR[id]) || null;

// 'best' | 'possible' | 'closed' for a destination in a month (typical pattern, not live).
export function seasonFit(id, month) {
  const d = byId[id];
  const route = seasonalRouteFor(id);
  if (route && !route.typical_open_months.includes(month)) return 'closed';
  return d.best_months.includes(month) ? 'best' : 'possible';
}

// The Karakoram Highway from Islamabad to Khunjerab, as road distance and altitude, built
// from the same curated legs the planner uses (approximate, for the home-page road profile).
export function kkhProfile() {
  const chain = ['islamabad', 'chilas', 'gilgit', 'hunza', 'attabad', 'passu', 'sost', 'khunjerab'];
  const altitude = (key) => byId[key]?.altitude_m ?? dataset.hubs[key]?.altitude_m;
  const leg = (a, b) => dataset.legs.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
  const names = { islamabad: 'Islamabad', chilas: 'Chilas', gilgit: 'Gilgit', hunza: 'Karimabad', attabad: 'Attabad', passu: 'Passu', sost: 'Sost', khunjerab: 'Khunjerab Pass' };
  let km = 0;
  return chain.map((key, i) => {
    if (i > 0) km += leg(chain[i - 1], key)?.km ?? 0;
    return { key, name: names[key], km, altitude: altitude(key) };
  });
}
