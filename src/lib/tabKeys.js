// Arrow keys for a row of tabs (the WAI-ARIA tabs pattern): Left/Right move and wrap, Home/End
// jump to the ends. Pair it with tabIndex={selected ? 0 : -1} so Tab leaves the row in one step.
export function tabKeyDown(e, ids, current, select, domId) {
  const i = ids.indexOf(current);
  const next = { ArrowRight: ids[(i + 1) % ids.length], ArrowLeft: ids[(i + ids.length - 1) % ids.length],
    Home: ids[0], End: ids[ids.length - 1] }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  select(next);
  document.getElementById(domId(next))?.focus();
}
