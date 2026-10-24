// Northern Pakistan destinations used across the site (cards, assistant, planner, seasons).
//
// PHOTOS
// - Drop your own photo into src/assets/destinations/<id>.jpg (or .jpeg/.png/.webp)
//   and it automatically replaces the remote photo for that destination.
// - Otherwise `photos` lists real photographs hosted on Wikimedia Commons (tried in order).
//   If every source fails, a mountain illustration is shown instead of a broken image.
//
// Facts here are general, stable travel knowledge. Nothing here is live data
// (no prices, road status or weather) — those must come from the backend.

export const destinations = [
  {
    id: 'hunza',
    name: 'Hunza Valley',
    region: 'Hunza · Karimabad',
    category: ['valleys', 'culture'],
    tagline: 'Forts, orchards and a ring of 7,000-metre peaks',
    description:
      'Karimabad sits on a terrace above the Hunza River, facing Rakaposhi and Diran. Walk the lanes to Baltit and Altit forts, climb to Eagle’s Nest for sunset, and time spring for apricot blossom or late autumn for gold poplars.',
    altitude: 2500,
    coords: '36.32°N · 74.66°E',
    duration: { min: 3, max: 6 },
    stay: 3,
    bestMonths: [4, 5, 6, 7, 8, 9, 10, 11],
    seasonNote: 'April blossom and late-October colours are the classic windows.',
    access: 'Fly Islamabad → Gilgit (weather-dependent), then about 2 hours by road. By road from Islamabad it is a 1–2 day drive on the Karakoram Highway.',
    highlights: ['Baltit Fort', 'Altit Fort & royal garden', 'Eagle’s Nest sunset', 'Rakaposhi viewpoint', 'Hunza cafés & local food'],
    nearby: ['attabad', 'passu', 'khunjerab'],
    dayPlans: [
      { title: 'Karimabad & the forts', activities: ['Baltit Fort guided visit', 'Walk the old bazaar lanes', 'Altit Fort and royal garden'] },
      { title: 'Eagle’s Nest & viewpoints', activities: ['Sunrise or sunset at Eagle’s Nest (Duikar)', 'Rakaposhi viewpoint stop', 'Local Hunza food tasting'] },
      { title: 'Slow day in the valley', activities: ['Orchard walk along the water channels', 'Handicraft shops in Karimabad', 'Golden-hour photography'] },
    ],
    tone: ['#1D4D6E', '#C98A4B'],
    photos: ["Hunza Valley, view from Eagle's Nest.jpg", 'Rakaposhi.Pakistan.JPG'],
  },
  {
    id: 'skardu',
    name: 'Skardu & Upper Kachura',
    region: 'Baltistan · Skardu',
    category: ['lakes', 'valleys'],
    tagline: 'Glass-still lakes in a cold desert',
    description:
      'The capital of Baltistan and the gateway to the Karakoram giants. Row across Upper Kachura’s clear water, stay by Shangrila, explore Shigar Fort and walk the dunes of the Katpana cold desert.',
    altitude: 2228,
    coords: '35.30°N · 75.63°E',
    duration: { min: 3, max: 5 },
    stay: 3,
    bestMonths: [4, 5, 6, 7, 8, 9, 10],
    seasonNote: 'Summer is green and busy; autumn is calm, clear and cooler.',
    access: 'Fly Islamabad → Skardu (weather-dependent, keep a buffer day). By road it is a long 1–2 day drive via the Karakoram Highway and the Jaglot–Skardu road.',
    highlights: ['Upper Kachura Lake', 'Shangrila (Lower Kachura)', 'Shigar Fort', 'Katpana cold desert', 'Manthokha waterfall'],
    nearby: ['deosai', 'k2'],
    dayPlans: [
      { title: 'Kachura lakes', activities: ['Boat ride on Upper Kachura Lake', 'Lunch by Shangrila (Lower Kachura)', 'Sunset at Katpana cold desert'] },
      { title: 'Shigar Valley', activities: ['Shigar Fort and its gardens', 'Village walk along the Shigar River', 'Evening in Skardu bazaar'] },
      { title: 'Waterfalls & villages', activities: ['Day trip to Manthokha waterfall', 'Kharmang valley viewpoints', 'Return to Skardu'] },
    ],
    tone: ['#234E5C', '#7FB9C9'],
    photos: ['Upper Kachura Lake.jpg', 'Sadpara with river-Skardu.jpg', 'All in One, Indus River Skardu,Sadpara Lake and Deosai Plains (Aerial View).jpg', 'Upper Kachura Lake, Skardu.jpg'],
  },
  {
    id: 'attabad',
    name: 'Attabad Lake',
    region: 'Gojal · Upper Hunza',
    category: ['lakes'],
    tagline: 'Turquoise water born from a mountain',
    description:
      'Formed by a landslide in 2010, Attabad is now one of the most vivid lakes in the Karakoram. Take a boat along the cliffs, stop at the lakeside, and continue up the Karakoram Highway into Gojal.',
    altitude: 2560,
    coords: '36.33°N · 74.86°E',
    duration: { min: 1, max: 2 },
    stay: 1,
    bestMonths: [4, 5, 6, 7, 8, 9, 10],
    seasonNote: 'The colour is brightest on clear summer days.',
    access: 'About 30–45 minutes from Karimabad on the Karakoram Highway, through the lakeside tunnels.',
    highlights: ['Boat ride on the lake', 'Lakeside viewpoints', 'Karakoram Highway tunnels', 'Gulmit village'],
    nearby: ['hunza', 'passu'],
    dayPlans: [
      { title: 'Attabad & Gulmit', activities: ['Boat ride along the cliffs', 'Lakeside lunch stop', 'Gulmit village and its old houses'] },
    ],
    tone: ['#0F5E69', '#41C6C0'],
    photos: ['Attabad Lake, from Gulmit (16419241679).jpg', 'Attabad Lake with reflections of mountains.jpg', 'Attabad Lake Panorama.jpg'],
  },
  {
    id: 'fairy-meadows',
    name: 'Fairy Meadows',
    region: 'Diamer · Raikot',
    category: ['treks'],
    tagline: 'Pine meadows under Nanga Parbat',
    description:
      'A high meadow facing the Rakhiot face of Nanga Parbat (8,126 m). Reach it by jeep from Raikot Bridge and a short hike, then spend a night under clear skies and walk on to Beyal Camp.',
    altitude: 3300,
    coords: '35.42°N · 74.60°E',
    duration: { min: 2, max: 4 },
    stay: 2,
    bestMonths: [6, 7, 8, 9],
    seasonNote: 'Snow closes the meadow in winter; June to September is the season.',
    access: 'Jeep from Raikot Bridge on the Karakoram Highway towards Tato, then a 2–3 hour hike. The jeep track is narrow — use local registered drivers.',
    highlights: ['Nanga Parbat view', 'Beyal Camp walk', 'Night-sky photography', 'Reflection lake'],
    nearby: ['hunza', 'skardu'],
    dayPlans: [
      { title: 'Raikot to Fairy Meadows', activities: ['Jeep ride from Raikot Bridge', 'Hike up to the meadow', 'Evening view of Nanga Parbat'] },
      { title: 'Beyal Camp walk', activities: ['Hike towards Beyal Camp', 'Reflection lake at sunrise', 'Stargazing at night'] },
    ],
    tone: ['#2D4A33', '#9BC29A'],
    photos: ['Nanga Parbat The Killer Mountain.jpg', 'Mighty nanga barbat from deosai plains.jpg', 'Fairy Meadows.jpg', 'Fairy Meadows, Pakistan.jpg'],
  },
  {
    id: 'deosai',
    name: 'Deosai National Park',
    region: 'Baltistan · Astore',
    category: ['high'],
    tagline: 'The plateau they call the land of giants',
    description:
      'One of the highest plateaus in the world, averaging around 4,100 m. Summer turns it into a sea of wildflowers, with Sheosar Lake, marmots and the Himalayan brown bear it protects.',
    altitude: 4114,
    coords: '35.00°N · 75.40°E',
    duration: { min: 1, max: 2 },
    stay: 1,
    bestMonths: [6, 7, 8, 9],
    seasonNote: 'Open roughly June to September; snow closes it the rest of the year.',
    access: 'Jeep from Skardu via Sadpara Lake, about 2–3 hours to the plateau. Nights are cold even in summer.',
    highlights: ['Sheosar Lake', 'Bara Pani stream', 'Wildflower season', 'Himalayan brown bear habitat'],
    nearby: ['skardu'],
    dayPlans: [
      { title: 'Deosai plateau', activities: ['Jeep via Sadpara Lake', 'Bara Pani and the open plains', 'Sheosar Lake picnic', 'Return to Skardu before dark'] },
    ],
    tone: ['#3D4A6B', '#B9A6D9'],
    photos: ['Sunset at Sheosar Lake.jpg', 'Barra Pani, Deosai Plains - Panorama.jpg', 'Deosai Plains in late August.jpg'],
  },
  {
    id: 'passu',
    name: 'Passu & Gojal',
    region: 'Gojal · Upper Hunza',
    category: ['valleys', 'treks'],
    tagline: 'Cathedral spires and a swaying bridge',
    description:
      'The serrated Passu Cones (Tupopdan, 6,106 m) rise straight above the Karakoram Highway. Cross the Hussaini suspension bridge, walk to Borith Lake and look out over the Passu Glacier.',
    altitude: 2400,
    coords: '36.47°N · 74.89°E',
    duration: { min: 1, max: 3 },
    stay: 1,
    bestMonths: [4, 5, 6, 7, 8, 9, 10],
    seasonNote: 'Autumn apricot-and-poplar colours make October special.',
    access: 'About 1 hour north of Karimabad on the Karakoram Highway, past Attabad Lake.',
    highlights: ['Passu Cones viewpoint', 'Hussaini suspension bridge', 'Borith Lake', 'Passu Glacier'],
    nearby: ['attabad', 'khunjerab', 'hunza'],
    dayPlans: [
      { title: 'Passu Cones & Hussaini', activities: ['Passu Cones viewpoint', 'Cross the Hussaini suspension bridge', 'Walk to Borith Lake'] },
      { title: 'Glacier walk', activities: ['Short hike towards Passu Glacier', 'Village apricot orchards', 'Sunset on the Cones'] },
    ],
    tone: ['#3E3A4F', '#D9A066'],
    photos: ['Borith Lake with the Passu Cones in backdrop.jpg', 'Tupopdan (6106m) (25845373136).jpg', 'Passu Cones and the Hunza River.jpg'],
  },
  {
    id: 'khunjerab',
    name: 'Khunjerab Pass',
    region: 'Hunza · Pak–China border',
    category: ['high'],
    tagline: 'The highest paved border crossing on Earth',
    description:
      'At 4,693 m, the top of the Karakoram Highway marks the border with China inside Khunjerab National Park — home to Marco Polo sheep and ibex. Go slowly: the altitude is real.',
    altitude: 4693,
    coords: '36.85°N · 75.43°E',
    duration: { min: 1, max: 1 },
    stay: 1,
    bestMonths: [5, 6, 7, 8, 9, 10],
    seasonNote: 'Seasonal — typically open late spring to late autumn. Confirm before you go.',
    access: 'A day trip from Passu or Sost along the Karakoram Highway. National park entry is paid at the checkpoint.',
    highlights: ['Pak–China border gate', 'Khunjerab National Park', 'Sost and the upper KKH', 'Wildlife spotting'],
    nearby: ['passu', 'attabad'],
    dayPlans: [
      { title: 'Up to Khunjerab', activities: ['Early start from Passu', 'Khunjerab National Park drive', 'Border gate at 4,693 m — keep the stop short', 'Back down to Gojal'] },
    ],
    tone: ['#29445E', '#E0E8EE'],
    photos: ['Khunjerab Pass.jpg', 'Khunjerab pass.jpg'],
  },
  {
    id: 'k2',
    name: 'K2 Base Camp & Concordia',
    region: 'Baltoro · Karakoram',
    category: ['treks', 'high'],
    tagline: 'The throne room of the mountain gods',
    description:
      'The great Karakoram trek: walk the Baltoro Glacier past the Trango Towers to Concordia, where K2 (8,611 m), Broad Peak and the Gasherbrums stand in one view. A serious expedition for fit trekkers.',
    altitude: 5150,
    coords: '35.88°N · 76.51°E',
    duration: { min: 14, max: 21 },
    stay: 14,
    bestMonths: [6, 7, 8],
    seasonNote: 'A short summer window, June to August.',
    access: 'From Skardu by jeep to Askole, then on foot. Requires a trekking permit and a registered operator.',
    highlights: ['Baltoro Glacier', 'Trango Towers', 'Concordia', 'K2 Base Camp'],
    nearby: ['skardu'],
    dayPlans: [
      { title: 'Skardu → Askole', activities: ['Jeep through the Braldu gorge', 'Gear and permit check'] },
      { title: 'Askole → Paiju', activities: ['Trek along the Braldu', 'Acclimatisation pace'] },
      { title: 'Baltoro Glacier', activities: ['Urdukas and Goro camps', 'Trango Towers and Masherbrum views'] },
      { title: 'Concordia & K2 Base Camp', activities: ['Sunrise on K2 and Broad Peak', 'Walk to K2 Base Camp'] },
      { title: 'Return trek', activities: ['Retrace the glacier towards Askole'] },
    ],
    tone: ['#203448', '#AFC6D6'],
    photos: ['K2 2006b.jpg', 'K2 8611.jpg'],
  },
];

export const destinationById = Object.fromEntries(destinations.map((d) => [d.id, d]));

export const categories = [
  { id: 'all', label: 'All' },
  { id: 'lakes', label: 'Lakes' },
  { id: 'valleys', label: 'Valleys' },
  { id: 'high', label: 'High altitude' },
  { id: 'treks', label: 'Treks' },
  { id: 'culture', label: 'Culture' },
];

// Route order along the main roads, used to sequence multi-stop plans.
export const routeOrder = ['fairy-meadows', 'skardu', 'deosai', 'k2', 'hunza', 'attabad', 'passu', 'khunjerab'];

export const clusterOf = (id) =>
  ['skardu', 'deosai', 'k2'].includes(id) ? 'skardu' : id === 'fairy-meadows' ? 'diamer' : 'hunza';

const aliasMap = {
  hunza: ['hunza', 'karimabad', 'baltit', 'altit', 'eagle'],
  skardu: ['skardu', 'kachura', 'shangrila', 'shangri', 'shigar', 'katpana', 'baltistan'],
  attabad: ['attabad', 'atabad', 'ataabad', 'gulmit'],
  'fairy-meadows': ['fairy', 'meadows', 'nanga', 'raikot', 'beyal'],
  deosai: ['deosai', 'sheosar', 'deosi'],
  passu: ['passu', 'pasu', 'hussaini', 'borith', 'gojal', 'tupopdan'],
  khunjerab: ['khunjerab', 'sost', 'border'],
  k2: ['k2', 'concordia', 'baltoro', 'askole'],
};

export function matchDestinations(text = '') {
  const t = text.toLowerCase();
  return destinations.filter((d) => aliasMap[d.id].some((a) => t.includes(a))).map((d) => d.id);
}

export const heroPhotos = [
  'Attabad Lake, from Gulmit (16419241679).jpg',
  'Borith Lake with the Passu Cones in backdrop.jpg',
  'K2 2006b.jpg',
];
export const heroCaption = 'Attabad Lake, Gojal — Upper Hunza';

export const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const seasonNotes = {
  winter: 'Deep winter. High plateaus, passes and treks are closed by snow. Skardu and Hunza towns stay reachable with snowy, quiet streets — flights are weather-dependent and the KKH can close after heavy snowfall.',
  spring: 'Blossom season. Apricot and cherry trees flower in Hunza and Skardu while high routes are still thawing.',
  summer: 'Peak season. Every road and trek is open — Deosai, Fairy Meadows, Khunjerab and the Baltoro. Book stays early.',
  autumn: 'Golden season. Poplars and orchards turn gold, skies are clearest, and crowds thin out. High routes begin closing by late autumn.',
};

export const seasonOf = (m) => (m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn');
