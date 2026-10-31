// After `vite build`: write crawlable HTML for every destination, page-specific meta tags,
// a sitemap and robots.txt. Uses the same shared/destinations.json as the app and the API.
//
//   dist/index.html                 home page (with the hero image preloaded)
//   dist/spa.html                   shell for app-only routes (/plan, /trips, /admin, 404)
//   dist/destinations/<id>.html     static, readable destination pages (React takes over on load)
//   dist/sitemap.xml, dist/robots.txt
//
// SITE_URL sets the public address used in canonical links (defaults to the Vercel URL).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const data = JSON.parse(readFileSync(join(root, 'shared/destinations.json'), 'utf8'));
const photos = JSON.parse(readFileSync(join(root, 'src/data/photos.meta.json'), 'utf8'));
const sizes = JSON.parse(readFileSync(join(root, 'src/data/photos.generated.json'), 'utf8'));
const SITE = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  || 'https://north-kappa-ivory.vercel.app').replace(/\/$/, '');
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const span = (ms) => `${MONTHS[ms[0] - 1]}–${MONTHS[ms[ms.length - 1] - 1]}`;
const metres = (n) => `${Number(n).toLocaleString('en-US')} m`;
const lakh = (n) => { const s = String(Math.round(Math.abs(n))); return s.length > 3 ? `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${s.slice(-3)}` : s; };

function preload(id) {
  const s = sizes[id];
  const set = s.widths.map((w) => `/images/${id}-${w}.webp ${w}w`).join(', ');
  return `<link rel="preload" as="image" type="image/webp" href="/images/${id}-800.webp" imagesrcset="${set}" imagesizes="100vw" fetchpriority="high" />`;
}

function page({ title, description, path, image, imageAlt, jsonLd, head = '', body = '' }) {
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${SITE}${path}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}${path}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${SITE}${image}$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${esc(imageAlt)}$2`);
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  html = html.replace('</head>', `    ${head}\n    ${ld}\n  </head>`);
  if (body) html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return html;
}

function write(rel, content) {
  const file = join(dist, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// App-only routes get the plain shell.
write('spa.html', template);

// Home page.
write('index.html', page({
  title: 'Raahi: AI trip planner for Northern Pakistan',
  description: 'Plan a realistic trip to Hunza, Skardu, Fairy Meadows, Deosai and the Karakoram Highway: drive days, overnight stops, season checks, live forecasts and honest cost estimates.',
  path: '/',
  image: '/images/og.jpg',
  imageAlt: photos.passu.alt,
  head: preload('passu'),
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Raahi', url: `${SITE}/`,
    description: 'AI travel concierge for Northern Pakistan (Gilgit-Baltistan and the Karakoram Highway).' },
}));

// One crawlable page per destination.
for (const d of data.destinations) {
  const stay = data.stays[d.id];
  const days = d.recommended_days.min === d.recommended_days.max ? `${d.recommended_days.min} day` : `${d.recommended_days.min}–${d.recommended_days.max} days`;
  const body = `
<main id="main" style="max-width:760px;margin:0 auto;padding:96px 20px 64px;font-family:system-ui,sans-serif;line-height:1.6">
  <p><a href="/">Raahi</a> / <a href="/#destinations">Destinations</a></p>
  <h1>${esc(d.name)}</h1>
  <p><strong>${esc(d.tagline)}</strong></p>
  <p>${esc(d.description)}</p>
  <ul>
    <li>Region: ${esc(d.region.replace(' · ', ', '))}, ${esc(d.province)}</li>
    <li>Altitude: about ${esc(metres(d.altitude_m))}</li>
    <li>Usually best: ${esc(span(d.best_months))}. ${esc(d.season_note)}</li>
    <li>Time to allow: ${esc(days)}</li>
  </ul>
  <h2>What to see and do</h2>
  <ul>${d.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
  <h2>Getting there</h2>
  <p>${esc(d.access)}</p>
  <h3>Access and fitness</h3>
  <p>${esc(d.accessibility)}</p>
  <h3>If the weather turns</h3>
  <p>${esc(d.bad_weather_alternative)}</p>
  ${stay ? `<h2>Where to stay</h2>${stay.note ? `<p>${esc(stay.note)}</p>` : ''}
  <ul>${stay.options.map((o) => `<li>${esc(o.name)} (${esc(o.tier)})${o.to ? `: Rs ${lakh(o.from)}–${lakh(o.to)} a night, indicative` : ''}</li>`).join('')}</ul>
  <p>${esc(stay.price_note)}</p>` : ''}
  <h2>Sources</h2>
  <ul>${d.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.label)}</a></li>`).join('')}</ul>
  <p>${esc(d.record_note)} Last reviewed ${esc(d.last_reviewed)}.</p>
  <p><a href="/plan?d=${esc(d.id)}">Plan a trip to ${esc(d.name)} with Raahi</a></p>
</main>`;
  write(`destinations/${d.id}.html`, page({
    title: `${d.name}: travel guide | Raahi`,
    description: `${d.tagline}. Altitude about ${metres(d.altitude_m)}, usually best ${span(d.best_months)}. ${d.access}`.slice(0, 300),
    path: `/destinations/${d.id}`,
    image: `/images/og-${d.id}.jpg`,
    imageAlt: photos[d.id]?.alt || d.name,
    head: preload(d.id),
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'TouristDestination',
      name: d.name,
      description: d.description,
      url: `${SITE}/destinations/${d.id}`,
      image: `${SITE}/images/og-${d.id}.jpg`,
      containedInPlace: { '@type': 'AdministrativeArea', name: `${d.province}, Pakistan` },
    },
  }));
}

// Sitemap and robots.
const urls = [
  { loc: '/', lastmod: data.meta.last_reviewed },
  { loc: '/plan', lastmod: data.meta.last_reviewed },
  ...data.destinations.map((d) => ({ loc: `/destinations/${d.id}`, lastmod: d.last_reviewed })),
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *
Allow: /
Disallow: /admin
Disallow: /trips
Disallow: /trip/
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`);
console.log(`prerender: ${data.destinations.length} destination pages, sitemap (${urls.length} URLs) and robots.txt for ${SITE}`);
