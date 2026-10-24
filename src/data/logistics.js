// Real travel logistics for Northern Pakistan: coordinates, road distances & drive
// times, stays, and a transparent cost model for the budget estimator.
//
// IMPORTANT HONESTY NOTES
// - Coordinates are precise and used for live weather (Open-Meteo) and Google Maps links.
// - Distances / drive times are accurate APPROXIMATE road figures (general knowledge of
//   the Karakoram Highway and GB roads). For the exact, live figure with traffic, every
//   leg links out to Google Maps, which computes it for you.
// - Stay prices are INDICATIVE ranges to help you budget, not live quotes. Confirm the
//   real price when you book (each stay links to a live search).
// - The cost model is a transparent estimate: every assumption is shown in the UI.

// ── Coordinates [lat, lng] ───────────────────────────────────────────────────
export const coords = {
  // destinations
  hunza: [36.3167, 74.6667],
  skardu: [35.2971, 75.6333],
  attabad: [36.3486, 74.8603],
  'fairy-meadows': [35.3869, 74.5744],
  deosai: [34.9667, 75.4167],
  passu: [36.4667, 74.8833],
  khunjerab: [36.8469, 75.4267],
  k2: [35.8808, 76.5133],
  // waypoints / hubs
  islamabad: [33.6844, 73.0479],
  rawalpindi: [33.5651, 73.0169],
  lahore: [31.5204, 74.3587],
  karachi: [24.8607, 67.0011],
  peshawar: [34.0151, 71.5249],
  gilgit: [35.9208, 74.3080],
  chilas: [35.4206, 74.0953],
  sost: [36.6667, 74.855],
  'raikot-bridge': [35.389, 74.579],
  askole: [35.6814, 75.8158],
};

// Nearest road gateway (for "get directions" links) per destination.
export const clusterGateway = {
  hunza: 'gilgit', attabad: 'gilgit', passu: 'gilgit', khunjerab: 'gilgit',
  skardu: 'skardu', deosai: 'skardu', 'fairy-meadows': 'raikot-bridge', k2: 'skardu',
};

export const originCoord = {
  Islamabad: 'islamabad',
  Rawalpindi: 'rawalpindi',
  Lahore: 'lahore',
  Karachi: 'karachi',
  Peshawar: 'peshawar',
  Gilgit: 'gilgit',
  Skardu: 'skardu',
};

// ── Curated road legs: accurate approximate distance (km) and drive time (hours) ──
// Keys are "a>b"; lookup tries both directions.
export const legs = {
  'islamabad>chilas': { km: 460, hours: [10, 12], note: 'Karakoram Highway via Besham (or Babusar Top in summer).' },
  'chilas>gilgit': { km: 130, hours: [3, 4], note: 'KKH along the Indus, past the three-ranges junction.' },
  'chilas>skardu': { km: 230, hours: [6, 7], note: 'Jaglot–Skardu road along the Indus gorge.' },
  'gilgit>skardu': { km: 210, hours: [6, 7], note: 'Jaglot–Skardu road; often combined with the KKH.' },
  'gilgit>hunza': { km: 100, hours: [2.5, 3], note: 'KKH north to Karimabad.' },
  'hunza>attabad': { km: 20, hours: [0.75, 1], note: 'KKH through the lakeside tunnels.' },
  'attabad>passu': { km: 25, hours: [0.75, 1], note: 'KKH past Gulmit.' },
  'passu>sost': { km: 35, hours: [1, 1.25], note: 'KKH to the last town before the border.' },
  'sost>khunjerab': { km: 85, hours: [2.5, 3], note: 'KKH climb into Khunjerab National Park.' },
  'passu>khunjerab': { km: 120, hours: [3.5, 4], note: 'KKH via Sost to the Pak–China border.' },
  'skardu>deosai': { km: 60, hours: [2.5, 3], note: 'Jeep via Sadpara Lake onto the plateau.' },
  'skardu>askole': { km: 120, hours: [6, 7], note: 'Rough jeep track through the Braldu gorge.' },
  'askole>k2': { km: 90, hours: [0, 0], note: 'On foot along the Baltoro Glacier — several trekking days.' },
  'raikot-bridge>fairy-meadows': { km: 15, hours: [1.5, 2.5], note: 'Narrow jeep track from the KKH, then a 2–3 h hike.' },
  'hunza>skardu': { km: 290, hours: [7, 9], note: 'Back down the KKH to Gilgit, then the Skardu road.' },
  'gilgit>chilas': { km: 130, hours: [3, 4], note: 'KKH south along the Indus.' },
  'gilgit>raikot-bridge': { km: 80, hours: [2, 2.5], note: 'KKH south towards Chilas.' },
};

const R = 6371;
function haversine([la1, lo1], [la2, lo2]) {
  const d = (x) => (x * Math.PI) / 180;
  const a = Math.sin(d(la2 - la1) / 2) ** 2 + Math.cos(d(la1)) * Math.cos(d(la2)) * Math.sin(d(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Distance/time between two known keys. Curated figure if we have it, else a flagged
// straight-line estimate scaled for mountain roads.
export function legBetween(aKey, bKey) {
  if (aKey === bKey) return null;
  const direct = legs[`${aKey}>${bKey}`] || legs[`${bKey}>${aKey}`];
  if (direct) return { ...direct, approx: false };
  const a = coords[aKey];
  const b = coords[bKey];
  if (!a || !b) return null;
  const straight = haversine(a, b);
  const km = Math.round((straight * 1.5) / 5) * 5; // road winding factor
  const h = km / 35; // ~35 km/h average on mountain roads
  return { km, hours: [Math.max(1, Math.floor(h)), Math.ceil(h * 1.2)], note: 'Straight-line estimate — open Google Maps for the exact road figure.', approx: true };
}

export const driveTimeLabel = (hours) => {
  if (!hours) return '';
  const [a, b] = hours;
  if (a === 0 && b === 0) return 'multi-day trek';
  return a === b ? `~${a} h` : `${a}–${b} h`;
};

// ── Google Maps deep links (no API key needed) ───────────────────────────────
const pair = (key) => (coords[key] ? `${coords[key][0]},${coords[key][1]}` : '');

export const mapsDirections = (fromKey, toKey) =>
  `https://www.google.com/maps/dir/?api=1&origin=${pair(fromKey)}&destination=${pair(toKey)}&travelmode=driving`;

export const mapsPlace = (key, label = '') =>
  `https://www.google.com/maps/search/?api=1&query=${pair(key)}${label ? `&query_place_id=` : ''}`.replace('&query_place_id=', `%20(${encodeURIComponent(label)})`);

export const mapsEmbed = (key, zoom = 9) =>
  coords[key] ? `https://maps.google.com/maps?q=${pair(key)}&z=${zoom}&output=embed` : null;

// ── Stays: real, well-known properties. Prices are INDICATIVE PKR/night ranges. ──
// `search` opens a live booking search so you can confirm the real, current price.
const bookingSearch = (q) => `https://www.google.com/travel/search?q=${encodeURIComponent(q + ' hotels')}`;

export const stays = {
  hunza: {
    base: 'Karimabad',
    options: [
      { name: 'Hunza Serena Inn', tier: 'Premium', from: 22000, to: 38000 },
      { name: "Eagle's Nest Hotel (Duikar)", tier: 'View', from: 14000, to: 26000 },
      { name: 'Hunza Darbar Hotel', tier: 'Mid-range', from: 8000, to: 15000 },
      { name: 'Local guesthouses in Karimabad', tier: 'Budget', from: 3500, to: 7000 },
    ],
    search: bookingSearch('Karimabad Hunza'),
  },
  skardu: {
    base: 'Skardu',
    options: [
      { name: 'Shangrila Resort (Lower Kachura)', tier: 'Premium', from: 20000, to: 40000 },
      { name: 'Byarsa / Summit Alpine Hotel', tier: 'Mid-range', from: 9000, to: 16000 },
      { name: 'PTDC Motel Skardu', tier: 'Mid-range', from: 8000, to: 14000 },
      { name: 'Guesthouses near the bazaar', tier: 'Budget', from: 3500, to: 7000 },
    ],
    search: bookingSearch('Skardu'),
  },
  attabad: {
    base: 'Gojal / lakeside',
    options: [
      { name: 'Luxus Hunza Attabad Lake', tier: 'Premium', from: 30000, to: 55000 },
      { name: 'Attabad Lake view guesthouses', tier: 'Mid-range', from: 8000, to: 16000 },
    ],
    search: bookingSearch('Attabad Lake Gojal'),
  },
  'fairy-meadows': {
    base: 'Fairy Meadows (seasonal)',
    options: [
      { name: 'Fairy Meadows Cottages', tier: 'Cabins', from: 8000, to: 18000 },
      { name: 'Raikot Sarai', tier: 'Cabins', from: 7000, to: 15000 },
      { name: 'Wooden huts / camping', tier: 'Budget', from: 3000, to: 6000 },
    ],
    search: bookingSearch('Fairy Meadows'),
    note: 'Open roughly June–September only; book cottages ahead in summer.',
  },
  deosai: {
    base: 'No hotels — camping',
    options: [{ name: 'Organised camping (Bara Pani / Sheosar)', tier: 'Camp', from: 4000, to: 9000 }],
    search: bookingSearch('Skardu'),
    note: 'Deosai has no hotels. Most visitors day-trip from Skardu or camp with an operator.',
  },
  passu: {
    base: 'Passu / Gulmit',
    options: [
      { name: 'Passu Tourist Lodge', tier: 'Mid-range', from: 7000, to: 13000 },
      { name: 'Borith Lake Hotel', tier: 'View', from: 8000, to: 15000 },
      { name: 'Gulmit guesthouses', tier: 'Budget', from: 3500, to: 7000 },
    ],
    search: bookingSearch('Passu Gojal Hunza'),
  },
  khunjerab: {
    base: 'Stay at Sost',
    options: [{ name: 'Sost town hotels (nearest beds)', tier: 'Mid-range', from: 6000, to: 12000 }],
    search: bookingSearch('Sost Hunza'),
    note: 'Khunjerab Pass is a day trip — there is no accommodation at the top. Sleep at Sost or Passu.',
  },
  k2: {
    base: 'Camping / trek',
    options: [{ name: 'Expedition camping (operator-arranged)', tier: 'Camp', from: 0, to: 0 }],
    search: bookingSearch('Skardu'),
    note: 'The Baltoro trek is fully camping-based and arranged through a licensed operator.',
  },
};

// ── Cost model (indicative PKR) — every figure is shown to the user as an assumption ──
export const costModel = {
  flightPerPersonOneWay: 30000, // Islamabad ↔ Skardu / Gilgit
  vehiclePerDay: 18000, // private 4x4, whole vehicle
  busPerPersonPerLeg: 3500, // intercity coaster
  excursionJeep: 12000, // Deosai / Fairy Meadows / Askole jeep, whole vehicle
  roomPerNight: 10000, // standard double, mid-range
  roomSleeps: 2,
  campPerPersonNight: 4500,
  foodPerPersonDay: 2500,
  entries: { deosai: 500, khunjerab: 800 }, // per person, national-park entry (local rate, indicative)
  guidePerDay: 6000, // optional local guide, whole group
};

export const costAssumptions = [
  'Flights: PKR 30,000 per person each way (Islamabad ↔ Skardu/Gilgit, weather-dependent)',
  'Private 4×4: PKR 18,000 per day for the whole vehicle',
  'Rooms: PKR 10,000 per night, 2 sharing (camping PKR 4,500 per person)',
  'Food: PKR 2,500 per person per day',
  'Jeep excursions (Deosai, Fairy Meadows): PKR 12,000 each',
  'National-park entry where applicable (Deosai, Khunjerab)',
];
