// A tiny site-wide toast queue: short confirmations ("Copied", "Saved") with an optional Undo.
// Any component can call toast(); <Toaster /> in the layout shows them, one at a time.
const listeners = new Set();
let current = null;
let timer = null;
let seq = 0;

function emit() {
  listeners.forEach((fn) => fn(current));
}

export function toast(input, { duration = 4200 } = {}) {
  const t = typeof input === 'string' ? { text: input } : input;
  seq += 1;
  current = { id: seq, tone: 'default', ...t };
  clearTimeout(timer);
  timer = setTimeout(dismiss, t.undo ? Math.max(duration, 6000) : duration);
  emit();
  return current.id;
}

export function dismiss() {
  clearTimeout(timer);
  current = null;
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
