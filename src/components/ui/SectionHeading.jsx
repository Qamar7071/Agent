export default function SectionHeading({ eyebrow, title, accent, children, id, dark = false, align = 'left' }) {
  return (
    <div className={`flex flex-col gap-2 ${align === 'center' ? 'items-center text-center' : ''}`}>
      <span className={`text-[13px] font-semibold uppercase tracking-[0.2em] ${dark ? 'text-glacier-300' : 'text-ink-500'}`}>{eyebrow}</span>
      <h2 id={id} className={`font-display text-[clamp(1.8rem,3.2vw,2.6rem)] font-bold leading-tight tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
        {title} {accent && <span className={dark ? 'text-glacier' : 'text-brand'}>{accent}</span>}
      </h2>
      {children && <p className={`mt-1 max-w-2xl text-[16px] leading-relaxed ${dark ? 'text-white/75' : 'text-ink-600'}`}>{children}</p>}
    </div>
  );
}
