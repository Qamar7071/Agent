// Decorative topographic contour lines — the brand's mountain motif.
export default function Contours({ className = '', color = 'currentColor', opacity = 0.12 }) {
  const lines = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 600" preserveAspectRatio="none" className={`pointer-events-none absolute ${className}`}>
      <g fill="none" stroke={color} strokeWidth="1.2" opacity={opacity}>
        {lines.map((i) => (
          <path
            key={i}
            d={`M-50 ${520 - i * 46} C 180 ${430 - i * 52}, 330 ${560 - i * 40}, 560 ${440 - i * 50} S 900 ${360 - i * 38}, 1250 ${470 - i * 52}`}
          />
        ))}
      </g>
    </svg>
  );
}
