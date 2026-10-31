// Small shared pieces for Safar Saathi screens.
import { AlertOctagon, AlertTriangle, BedDouble, Car, CircleCheck, CircleEllipsis, Info, Mountain, ShoppingBag,
  UtensilsCrossed } from 'lucide-react';

export const CATEGORY_ICON = {
  stay: BedDouble, food: UtensilsCrossed, transport: Car, activities: Mountain, shopping: ShoppingBag, other: CircleEllipsis,
};

export function CategoryIcon({ category, size = 18, className = '' }) {
  const Icon = CATEGORY_ICON[category] || CircleEllipsis;
  return <Icon size={size} aria-hidden="true" className={className} />;
}

// Status is never shown by colour alone: every tone has an icon and a word.
export const TONE = {
  on_track: { box: 'border-juniper-200 bg-juniper-50', text: 'text-juniper-700', bar: 'bg-juniper-600', icon: CircleCheck },
  careful: { box: 'border-ochre/40 bg-ochre-50', text: 'text-ochre-700', bar: 'bg-ochre', icon: AlertTriangle },
  over: { box: 'border-brick/40 bg-brick-50', text: 'text-brick', bar: 'bg-brick', icon: AlertOctagon },
  info: { box: 'border-lake/30 bg-lake-50', text: 'text-lake-700', bar: 'bg-lake', icon: Info },
};

export function StatusChip({ status, label }) {
  const t = TONE[status] || TONE.info;
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${t.box} ${t.text}`}>
      <Icon size={14} aria-hidden="true" /> {label}
    </span>
  );
}

export function Section({ title, id, children, action = null, className = '' }) {
  return (
    <section aria-labelledby={id} className={`panel p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="type-semiwide text-base font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
