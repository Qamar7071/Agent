export const pkr = (n) =>
  typeof n === 'number' && Number.isFinite(n) ? `PKR ${Math.round(n).toLocaleString('en-PK')}` : null;

export const metres = (n) => `${n.toLocaleString('en-US')} m`;

export const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthRange(list) {
  if (!list?.length) return '';
  const sorted = [...list].sort((a, b) => a - b);
  return `${monthShort[sorted[0] - 1]} – ${monthShort[sorted[sorted.length - 1] - 1]}`;
}

export function addDays(iso, n) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d;
}

export const fmtDate = (d) =>
  d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

export function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`);
  return Math.round(ms / 86400000) + 1;
}

export const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};
