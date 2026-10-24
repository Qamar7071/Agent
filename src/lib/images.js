import { destinationById, heroPhotos } from '../data/destinations.js';

// Your own photos: put files in src/assets/destinations/ named after the destination id
// (e.g. hunza.jpg, skardu.webp, hero.jpg, cta.jpg). They are picked up at build time
// and always take priority over the remote photos.
const localFiles = import.meta.glob('../assets/destinations/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG}', {
  eager: true,
  import: 'default',
});

const local = {};
for (const [path, url] of Object.entries(localFiles)) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
  local[name] = url;
}

const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
const toCommonsName = (file) => encodeURIComponent(file.replace(/ /g, '_'));

export const commonsUrl = (file, width = 1600) => `${COMMONS}${toCommonsName(file)}?width=${width}`;
export const commonsPage = (file) => `https://commons.wikimedia.org/wiki/File:${toCommonsName(file)}`;

export function sourcesFor(id, width = 1200) {
  const d = destinationById[id];
  const list = [];
  if (local[id]) list.push(local[id]);
  if (d) list.push(...d.photos.map((f) => commonsUrl(f, width)));
  return list;
}

export function heroSources(width = 2200) {
  return [local.hero, ...heroPhotos.map((f) => commonsUrl(f, width))].filter(Boolean);
}

export function ctaSources(width = 2000) {
  return [local.cta, ...sourcesFor('k2', width), ...sourcesFor('passu', width)].filter(Boolean);
}

export const hasLocalPhoto = (id) => Boolean(local[id]);

// Credit line for a destination's first remote photo (used in the detail view).
export function creditFor(id) {
  if (local[id]) return { label: 'Photo: project library', href: null };
  const d = destinationById[id];
  if (!d) return null;
  return { label: 'Photo via Wikimedia Commons', href: commonsPage(d.photos[0]) };
}
