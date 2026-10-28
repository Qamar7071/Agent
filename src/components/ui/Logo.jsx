// Raahi ("traveller" in Urdu): a road climbing between two peaks.
export default function Logo({ light = true }) {
  const fg = light ? '#FFFFFF' : '#173A2E';
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" width="34" height="28" viewBox="0 0 34 28" className="shrink-0">
        <path d="M1 26 L11 7 L17 16 L22 9 L33 26 Z" fill={fg} />
        <path d="M5 26 C 12 22, 14 19, 18 18 S 24 16, 26 12" fill="none" stroke="#E39A3B" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className={`type-wide text-[22px] font-extrabold leading-none ${light ? 'text-white' : 'text-juniper'}`}>Raahi</span>
    </span>
  );
}
