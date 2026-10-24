export default function Logo({ dark = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" width="46" height="34" viewBox="0 0 46 34" className="shrink-0">
        <path d="M2 31 L15 9 L22 20 L27 13 L44 31 Z" fill={dark ? '#0B1B2E' : '#FFFFFF'} />
        <path d="M11 22 L15 15 L19 21" fill="none" stroke={dark ? '#FFFFFF' : '#1570EF'} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M30 6 L42 2 L37 9 Z" fill="#3D8BFF" />
        <path d="M36 5 C 33 9, 30 12, 26 14" fill="none" stroke="#3D8BFF" strokeWidth="1.6" strokeDasharray="1.5 2.5" strokeLinecap="round" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={`font-display text-[24px] font-bold tracking-tight ${dark ? 'text-ink' : 'text-white'}`}>
          Raahi <span className="text-brand-400">AI</span>
        </span>
        <span className={`mt-1 text-[12px] font-medium ${dark ? 'text-ink-500' : 'text-white/80'}`}>Your Personal Travel Agent</span>
      </span>
    </span>
  );
}
