import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';

const styles = {
  danger: { box: 'border-brick/40 bg-brick-50', icon: AlertOctagon, tone: 'text-brick', label: 'Important' },
  warning: { box: 'border-ochre/40 bg-ochre-50', icon: AlertTriangle, tone: 'text-ochre', label: 'Warning' },
  info: { box: 'border-lake/30 bg-lake-50', icon: Info, tone: 'text-lake', label: 'Note' },
};

export default function Notice({ level = 'info', title, children, action, className = '' }) {
  const s = styles[level] || styles.info;
  const Icon = s.icon;
  return (
    <div className={`flex gap-3 rounded border px-3.5 py-3 text-sm text-ink-700 ${s.box} ${className}`} role={level === 'danger' ? 'alert' : undefined}>
      <Icon size={18} className={`mt-[2px] shrink-0 ${s.tone}`} aria-label={s.label} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div>{children}</div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
