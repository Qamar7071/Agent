// A helpful empty state: what this place is for, and the next step to take.
export default function EmptyState({ icon: Icon, title, children, actions = null, className = '', tone = 'light' }) {
  const dark = tone === 'dark';
  return (
    <div className={`topo flex flex-col items-start gap-3 overflow-hidden rounded-2xl border p-6 sm:p-8 ${dark ? 'border-white/10 bg-white/[0.03] text-ink [--topo-opacity:0.05]' : 'border-dashed border-limestone-400 bg-paper/70 text-juniper [--topo-opacity:0.05]'} ${className}`}>
      {Icon && (
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${dark ? 'bg-white/10 text-ink' : 'bg-juniper-50 text-juniper-700'}`} aria-hidden="true">
          <Icon size={24} />
        </span>
      )}
      <h3 className="type-semiwide text-xl font-bold text-ink">{title}</h3>
      {children && <div className="max-w-prose text-ink-600">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
