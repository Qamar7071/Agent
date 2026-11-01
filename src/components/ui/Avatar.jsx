// A person's initials in a coloured circle. The colour comes from the name, so the same person
// keeps the same colour on every screen and every phone.
const TONES = [
  'bg-juniper-100 text-juniper-700',
  'bg-lake-100 text-lake-700',
  'bg-ochre-100 text-ochre-700',
  'bg-apricot-100 text-ochre-700',
  'bg-brick-50 text-brick',
  'bg-limestone-300 text-ink-700',
];

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = [...parts[0]][0] || '';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] || '' : '';
  return (first + last).toUpperCase();
}

function tone(name = '') {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export default function Avatar({ name, size = 32, ring = false, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold ${tone(name)} ${ring ? 'ring-2 ring-paper' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
