export const origins = ['Islamabad', 'Rawalpindi', 'Lahore', 'Karachi', 'Peshawar', 'Gilgit', 'Skardu'];

export const interests = [
  { id: 'lakes', label: 'Lakes' },
  { id: 'trekking', label: 'Trekking' },
  { id: 'culture', label: 'Forts & culture' },
  { id: 'photography', label: 'Photography' },
  { id: 'food', label: 'Local food' },
  { id: 'family', label: 'Family-friendly' },
  { id: 'stargazing', label: 'Stargazing' },
  { id: 'adventure', label: 'Adventure' },
];

export const transports = [
  { id: 'flight', label: 'Flight + local jeep', hint: 'Fastest; flights are weather-dependent' },
  { id: 'car', label: 'Private car / 4×4', hint: 'Most flexible on the KKH' },
  { id: 'bus', label: 'Coaster / bus', hint: 'Budget-friendly, fixed timings' },
  { id: 'bike', label: 'Motorbike', hint: 'For experienced riders' },
];

export const budgetPresets = [50000, 100000, 200000, 400000];

export const experiences = [
  {
    id: 'family',
    title: 'Family & slow travel',
    text: 'Short drives, comfortable stays and lakeside afternoons — Hunza, Attabad and Skardu at an easy pace.',
    destinations: ['hunza', 'attabad', 'skardu'],
    interests: ['family', 'lakes', 'food'],
    days: 7,
    photo: 'hunza',
  },
  {
    id: 'trek',
    title: 'Treks & expeditions',
    text: 'From an overnight at Fairy Meadows to the Baltoro Glacier — routes planned around acclimatisation.',
    destinations: ['fairy-meadows', 'k2'],
    interests: ['trekking', 'adventure'],
    days: 18,
    photo: 'k2',
  },
  {
    id: 'culture',
    title: 'Forts, food & culture',
    text: 'Baltit, Altit and Shigar forts, village lanes and Hunza and Balti kitchens.',
    destinations: ['hunza', 'skardu', 'passu'],
    interests: ['culture', 'food'],
    days: 8,
    photo: 'passu',
  },
  {
    id: 'photo',
    title: 'Photography & night skies',
    text: 'Golden hour on the Passu Cones, sunrise on Nanga Parbat and the dark skies of Deosai.',
    destinations: ['passu', 'fairy-meadows', 'deosai'],
    interests: ['photography', 'stargazing'],
    days: 9,
    photo: 'deosai',
  },
];

export const safetyTips = [
  { icon: 'Mountain', title: 'Respect the altitude', text: 'Khunjerab, Deosai and the Baltoro sit above 4,000 m. Ascend gradually, drink water and come down if headaches or nausea get worse.' },
  { icon: 'Route', title: 'Check the KKH before you leave', text: 'Landslides and snow can close the Karakoram Highway and the Skardu road. Check official updates the morning you travel.' },
  { icon: 'Plane', title: 'Keep a buffer day', text: 'Flights to Skardu and Gilgit are often cancelled for weather. One spare day protects the rest of your plan.' },
  { icon: 'Wallet', title: 'Carry some cash', text: 'Card payments and ATMs are limited beyond the main towns. Keep enough cash for jeeps, food and entry fees.' },
  { icon: 'Signal', title: 'Expect patchy signal', text: 'Mobile coverage drops in valleys and on the plateaus. Share your route with someone and download offline maps.' },
  { icon: 'HeartHandshake', title: 'Travel respectfully', text: 'Dress modestly, ask before photographing people, and leave no litter — these valleys are people’s homes.' },
];

export const officialSources = [
  { label: 'Pakistan Meteorological Department', href: 'https://www.pmd.gov.pk', note: 'Forecasts & weather alerts' },
  { label: 'National Disaster Management Authority', href: 'https://www.ndma.gov.pk', note: 'Advisories, floods & landslides' },
  { label: 'National Highway Authority', href: 'https://nha.gov.pk', note: 'Highway & KKH information' },
  { label: 'Gilgit-Baltistan Tourism Department', href: 'https://tourismdept.gbit.gov.pk', note: 'Official destination info' },
];

export const emergencyNumbers = [
  { label: 'Rescue', number: '1122' },
  { label: 'Police', number: '15' },
];

export const quickActions = [
  { id: 'discover', label: 'Discover places in Northern Pakistan', icon: 'Compass', prompt: 'Show me the best places to visit in Northern Pakistan.' },
  { id: 'itinerary', label: 'Create a personalised itinerary', icon: 'Route', prompt: 'Create a personalised itinerary for my trip to Northern Pakistan.' },
  { id: 'budget', label: 'Find destinations within my budget', icon: 'Wallet', prompt: 'Which destinations fit my budget?' },
  { id: 'conditions', label: 'Check road & weather information', icon: 'CloudSun', prompt: 'What are the current road and weather conditions?' },
  { id: 'nearby', label: 'Find nearby attractions', icon: 'MapPin', prompt: 'What attractions are near my base?' },
];
