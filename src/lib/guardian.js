// The Guardian's risk factors grouped into plain-language categories. Pure, unit-tested.
// Factor names come from the backend risk model (shared/destinations.json → risk_model).

export const CATEGORIES = [
  { key: 'weather', label: 'Weather', factors: ['forecast_severe', 'official_alert'],
    plain: 'Severe weather in the forecast, or an official PMD warning.' },
  { key: 'environment', label: 'Season and environment', factors: ['monsoon_landslide', 'winter_conditions', 'community_reports'],
    plain: 'What the season brings: monsoon landslides, winter cold and snow.' },
  { key: 'altitude', label: 'Altitude', factors: ['high_altitude'],
    plain: 'Thinner air on high ground; some people feel it above about 3,000 m.' },
  { key: 'road', label: 'Road uncertainty', factors: ['seasonal_closure', 'scenario_hazard'],
    plain: 'Roads that are usually closed then, or a closure you are testing in the Travel Twin.' },
  { key: 'timing', label: 'Travel timing', factors: ['long_drive', 'after_dark'],
    plain: 'Long mountain drives, and arrivals after sunset.' },
];
const OF = Object.fromEntries(CATEGORIES.flatMap((c) => c.factors.map((f) => [f, c.key])));

export const categoryOf = (factor) => OF[factor] || 'environment';

/** Points per category for one day: [{ key, label, points, factors: [...] }], biggest first, zeros dropped. */
export function dayCategories(day) {
  const by = {};
  for (const f of day?.factors || []) {
    const k = categoryOf(f.factor);
    (by[k] ||= { points: 0, factors: [] });
    by[k].points += f.points || 0;
    by[k].factors.push(f);
  }
  return CATEGORIES.filter((c) => by[c.key]).map((c) => ({ ...c, points: Math.round(by[c.key].points * 10) / 10, factors: by[c.key].factors }))
    .sort((a, b) => b.points - a.points);
}

/** The whole trip: every category with its total points and the days it touches. */
export function tripCategories(days) {
  return CATEGORIES.map((c) => {
    const touched = (days || []).map((d) => ({ day: d.day, cat: dayCategories(d).find((x) => x.key === c.key) })).filter((x) => x.cat);
    return { ...c, points: Math.round(touched.reduce((n, x) => n + x.cat.points, 0) * 10) / 10, days: touched.map((x) => x.day) };
  });
}
