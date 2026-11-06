// Searching and filtering the destination guide. Pure functions, unit-tested with node --test.

export const CATEGORY_LABELS = {
  valleys: 'Valleys',
  lakes: 'Lakes',
  high: 'High passes & plateaus',
  treks: 'Treks',
  culture: 'Forts & culture',
};

const FIT_ORDER = { best: 0, possible: 1, closed: 2 };

/** Lower-case, accents and punctuation removed: "Eagle’s Nest" and "eagles nest" match. */
export function normalise(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Every word a person might search for a place by. */
export function searchText(d) {
  return normalise([
    d.name, d.region, d.province, d.tagline, d.description, ...(d.highlights || []), ...(d.aliases || []),
    ...(d.category || []).map((c) => CATEGORY_LABELS[c] || c),
  ].join(' '));
}

export function matches(d, query) {
  const words = normalise(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const text = searchText(d);
  return words.every((w) => text.includes(w));
}

/**
 * The places to show: those matching every search word and at least one chosen kind, sorted.
 * seasonFit(id, month) -> 'best' | 'possible' | 'closed' is passed in, so this stays pure.
 */
export function filterDestinations(list, { query = '', categories = [], month = null, sort = 'season', seasonFit = null } = {}) {
  const out = (list || []).filter((d) => matches(d, query)
    && (!categories.length || (d.category || []).some((c) => categories.includes(c))));
  const original = new Map((list || []).map((d, i) => [d.id, i]));
  const byOriginal = (a, b) => original.get(a.id) - original.get(b.id);
  if (sort === 'altitude') return out.sort((a, b) => b.altitude_m - a.altitude_m || byOriginal(a, b));
  if (sort === 'days') return out.sort((a, b) => a.recommended_days.min - b.recommended_days.min || byOriginal(a, b));
  if (month && seasonFit) {
    return out.sort((a, b) => FIT_ORDER[seasonFit(a.id, month)] - FIT_ORDER[seasonFit(b.id, month)] || byOriginal(a, b));
  }
  return out.sort(byOriginal);
}
