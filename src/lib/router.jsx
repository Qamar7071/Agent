// A small client-side router on the History API: enough for Raahi's handful of pages,
// without another dependency. Links render real <a href> elements, so pages stay crawlable.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterCtx = createContext(null);

function current() {
  return { path: window.location.pathname.replace(/\/+$/, '') || '/', search: window.location.search, hash: window.location.hash };
}

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(current);

  useEffect(() => {
    const onPop = () => setLoc(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.assign(to);
      return;
    }
    const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
    setLoc(current());
    requestAnimationFrame(() => {
      if (url.hash) {
        document.getElementById(url.hash.slice(1))?.scrollIntoView({ block: 'start' });
      } else if (!samePage) {
        window.scrollTo(0, 0);
      }
    });
  }, []);

  const value = useMemo(() => ({ ...loc, query: new URLSearchParams(loc.search), navigate }), [loc, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

export function Link({ to, onClick, children, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target === '_blank') return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// Match "/destinations/:id" style patterns. Returns params or null.
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
