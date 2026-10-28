// Photos of the real places, served as responsive WebP files from /images
// (made by scripts/build_images.py from photos/originals). photos.meta.json holds the alt
// text (what each photo actually shows), the place, the credit and the focal point.
// Credits come from the files' own metadata where it exists; where it does not, we say so
// rather than guess.
import sizes from './photos.generated.json';
import meta from './photos.meta.json';

export const photos = meta;

export function srcSet(id) {
  const s = sizes[id];
  return s ? s.widths.map((w) => `/images/${id}-${w}.webp ${w}w`).join(', ') : '';
}

export function photoSrc(id, width = 800) {
  const s = sizes[id];
  if (!s) return '';
  const w = s.widths.find((x) => x >= width) || s.widths[s.widths.length - 1];
  return `/images/${id}-${w}.webp`;
}

export const photoSize = (id) => sizes[id] || { width: 4, height: 3 };

export const creditLine = (id) =>
  photos[id]?.credit ? `Photo: ${photos[id].credit} (from the image file)` : 'Photo: photographer not recorded in the file';
