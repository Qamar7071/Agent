// Fade content up once as it scrolls into view. Skipped entirely for people who prefer reduced
// motion, for printing and where IntersectionObserver is missing: the content simply shows.
import { useEffect, useRef, useState } from 'react';

const canAnimate = () => typeof window !== 'undefined' && 'IntersectionObserver' in window
  && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [state, setState] = useState(() => (canAnimate() ? 'waiting' : 'shown'));

  useEffect(() => {
    if (state !== 'waiting' || !ref.current) return undefined;
    const el = ref.current;
    // Already on screen when the page opens: show it straight away, without a flash.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
      setState('in');
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState('in');
        io.disconnect();
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    io.observe(el);
    const onPrint = () => setState('shown');
    window.addEventListener('beforeprint', onPrint);
    return () => {
      io.disconnect();
      window.removeEventListener('beforeprint', onPrint);
    };
  }, [state]);

  const cls = state === 'waiting' ? 'reveal-init' : state === 'in' ? 'reveal-in' : '';
  return (
    <Tag ref={ref} className={`${cls} ${className}`} style={state === 'in' && delay ? { animationDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}
