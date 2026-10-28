export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const pkr = (n) => (Number.isFinite(n) ? `PKR ${Math.round(n).toLocaleString('en-US')}` : '—');
export const metres = (n) => (Number.isFinite(n) ? `${n.toLocaleString('en-US')} m` : '—');
export const km = (n) => (Number.isFinite(n) ? `${n.toLocaleString('en-US')} km` : null);

export function monthSpan(list) {
  if (!list?.length) return '';
  const s = [...list].sort((a, b) => a - b);
  return s.length === 12 ? 'all year' : `${MONTHS_SHORT[s[0] - 1]}–${MONTHS_SHORT[s[s.length - 1] - 1]}`;
}

export function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "checked 14:05" in the traveller's own time zone, plus the date when it is not today.
export function checkedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
