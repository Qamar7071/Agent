import { useEffect } from 'react';

const SITE = 'Raahi';

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const [, key, name] = selector.match(/\[(name|property)="([^"]+)"\]/) || [];
    if (key) el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

// Title, description, canonical URL and robots for the current page.
export function usePageMeta({ title, description, path, noindex = false }) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : `${SITE}: AI trip planner for Northern Pakistan`;
    if (description) {
      setMeta('meta[name="description"]', 'content', description);
      setMeta('meta[property="og:description"]', 'content', description);
    }
    setMeta('meta[property="og:title"]', 'content', document.title);
    setMeta('meta[name="robots"]', 'content', noindex ? 'noindex, nofollow' : 'index, follow');
    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical && path !== undefined) {
      const origin = canonical.href ? new URL(canonical.href).origin : window.location.origin;
      canonical.href = `${origin}${path}`;
    }
  }, [title, description, path, noindex]);
}
