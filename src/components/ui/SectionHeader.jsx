// The heading of a page section: a small label, a wide headline and a lead paragraph,
// with an optional action on the right on large screens.
export default function SectionHeader({ id, eyebrow, title, children, action = null, align = 'left', className = '' }) {
  const centred = align === 'center';
  return (
    <div className={`flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between ${centred ? 'items-center text-center lg:flex-col lg:items-center' : ''} ${className}`}>
      <div className={centred ? 'flex flex-col items-center' : ''}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className={`section-title ${eyebrow ? 'mt-3' : ''} ${centred ? 'max-w-3xl' : 'max-w-[24ch]'}`}>{title}</h2>
        {children && <div className={`lead mt-4 ${centred ? 'mx-auto' : ''}`}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
